import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_CAP,
  dedupePerDay,
  enforceCap,
  generateInstances,
  instancesForDate,
  reconcile,
  rollForward,
  weekSlots,
} from './schedule.js';
import { addDays, isWeekend } from './dates.js';

// 2026-08-17 is a Monday, so week offsets read naturally in these tests.
const MONDAY = '2026-08-17';
const SATURDAY = '2026-08-22';

const settings = { weekStartsOn: 1 };

function task(id, timesPerWeek) {
  return { id, name: id, timesPerWeek, categoryId: 'c1', active: true };
}

function instance(id, scheduledDate, originalDueDate = scheduledDate) {
  return {
    id,
    key: id,
    taskId: 't',
    scheduledDate,
    originalDueDate,
    status: 'incomplete',
    completedAt: null,
  };
}

describe('weekSlots', () => {
  it('spreads occurrences evenly rather than bunching them up', () => {
    expect(weekSlots(1)).toEqual([0]);
    expect(weekSlots(2)).toEqual([0, 4]);
    expect(weekSlots(3)).toEqual([0, 2, 5]);
    expect(weekSlots(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('always returns exactly the requested number of days', () => {
    for (let n = 1; n <= 7; n += 1) {
      expect(weekSlots(n)).toHaveLength(n);
    }
  });

  it('clamps out-of-range frequencies', () => {
    expect(weekSlots(0)).toHaveLength(1);
    expect(weekSlots(99)).toHaveLength(7);
  });
});

describe('generateInstances', () => {
  it('creates one instance per slot per week in the window', () => {
    const out = generateInstances([task('t1', 2)], [], MONDAY, settings);
    // 2×/week over the 5 weeks the window covers
    expect(out).toHaveLength(10);
    expect(out.every((i) => i.status === 'incomplete')).toBe(true);
  });

  it('is idempotent — running twice creates nothing new', () => {
    const once = generateInstances([task('t1', 3)], [], MONDAY, settings);
    const twice = generateInstances([task('t1', 3)], once, MONDAY, settings);
    expect(twice).toHaveLength(once.length);
  });

  it('skips inactive tasks', () => {
    const t = { ...task('t1', 3), active: false };
    expect(generateInstances([t], [], MONDAY, settings)).toHaveLength(0);
  });

  it('does not create instances for days already past', () => {
    const wednesday = '2026-08-19';
    const out = generateInstances([task('t1', 7)], [], wednesday, settings);
    expect(out.every((i) => i.scheduledDate >= wednesday)).toBe(true);
  });
});

describe('rollForward', () => {
  it('moves incomplete tasks from past days to today', () => {
    const out = rollForward([instance('a', '2026-08-14')], MONDAY);
    expect(out[0].scheduledDate).toBe(MONDAY);
  });

  it('keeps originalDueDate so waiting time is still known', () => {
    const out = rollForward([instance('a', '2026-08-14')], MONDAY);
    expect(out[0].originalDueDate).toBe('2026-08-14');
  });

  it('leaves completed tasks where they are', () => {
    const done = { ...instance('a', '2026-08-14'), status: 'complete' };
    expect(rollForward([done], MONDAY)[0].scheduledDate).toBe('2026-08-14');
  });

  it('does not touch tasks scheduled in the future', () => {
    const out = rollForward([instance('a', '2026-08-25')], MONDAY);
    expect(out[0].scheduledDate).toBe('2026-08-25');
  });
});

describe('enforceCap', () => {
  it('leaves a weekday at the cap alone', () => {
    const five = Array.from({ length: 5 }, (_, i) => instance(`a${i}`, MONDAY));
    const out = enforceCap(five, MONDAY);
    expect(instancesForDate(out, MONDAY)).toHaveLength(5);
  });

  it('bumps the shortest-waiting task when a weekday is over the cap', () => {
    const six = [
      instance('old', MONDAY, '2026-08-10'),
      instance('a', MONDAY, '2026-08-12'),
      instance('b', MONDAY, '2026-08-13'),
      instance('c', MONDAY, '2026-08-14'),
      instance('d', MONDAY, '2026-08-15'),
      instance('newest', MONDAY, MONDAY), // waited the least
    ];
    const out = enforceCap(six, MONDAY);

    expect(instancesForDate(out, MONDAY)).toHaveLength(5);
    const moved = out.find((i) => i.id === 'newest');
    expect(moved.scheduledDate).toBe('2026-08-18');
    // the longest-waiting one kept its place
    expect(out.find((i) => i.id === 'old').scheduledDate).toBe(MONDAY);
  });

  it('cascades day by day when the next day is also full', () => {
    // 11 tasks all landing on Monday: 5 stay, 5 go to Tuesday, 1 to Wednesday.
    const many = Array.from({ length: 11 }, (_, i) =>
      instance(`t${String(i).padStart(2, '0')}`, MONDAY, `2026-08-${10 + i}`),
    );
    const out = enforceCap(many, MONDAY);

    expect(instancesForDate(out, MONDAY)).toHaveLength(5);
    expect(instancesForDate(out, '2026-08-18')).toHaveLength(5);
    expect(instancesForDate(out, '2026-08-19')).toHaveLength(1);
  });

  it('lets weekends hold more than the cap', () => {
    const eight = Array.from({ length: 8 }, (_, i) =>
      instance(`a${i}`, SATURDAY, `2026-08-${10 + i}`),
    );
    const out = enforceCap(eight, SATURDAY);
    expect(instancesForDate(out, SATURDAY)).toHaveLength(8);
    expect(isWeekend(SATURDAY)).toBe(true);
  });

  it('terminates on a large backlog instead of cascading forever', () => {
    const flood = Array.from({ length: 60 }, (_, i) =>
      instance(`t${String(i).padStart(2, '0')}`, MONDAY, MONDAY),
    );
    const out = enforceCap(flood, MONDAY);
    expect(out).toHaveLength(60);
    // every weekday between today and the last placement respects the cap
    let cursor = MONDAY;
    for (let i = 0; i < 20; i += 1) {
      if (!isWeekend(cursor)) {
        expect(instancesForDate(out, cursor).length).toBeLessThanOrEqual(
          WEEKDAY_CAP,
        );
      }
      cursor = addDays(cursor, 1);
    }
  });

  it('ignores completed tasks when counting a day', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => ({
        ...instance(`done${i}`, MONDAY),
        status: 'complete',
      })),
      instance('live', MONDAY),
    ];
    const out = enforceCap(rows, MONDAY);
    expect(out.find((i) => i.id === 'live').scheduledDate).toBe(MONDAY);
  });
});

describe('dedupePerDay', () => {
  function forTask(id, taskId, date, orig) {
    return { ...instance(id, date, orig), taskId };
  }

  it('collapses a rolled-forward copy onto the day the task was already due', () => {
    const rows = [
      forTask('scheduled', 't1', MONDAY, MONDAY),
      forTask('rolled', 't1', MONDAY, '2026-08-14'),
    ];
    const out = dedupePerDay(rows);
    expect(out).toHaveLength(1);
    // the longest-waiting copy survives
    expect(out[0].id).toBe('rolled');
  });

  it('keeps the same task on different days', () => {
    const rows = [
      forTask('a', 't1', MONDAY, MONDAY),
      forTask('b', 't1', '2026-08-18', '2026-08-18'),
    ];
    expect(dedupePerDay(rows)).toHaveLength(2);
  });

  it('keeps different tasks on the same day', () => {
    const rows = [
      forTask('a', 't1', MONDAY, MONDAY),
      forTask('b', 't2', MONDAY, MONDAY),
    ];
    expect(dedupePerDay(rows)).toHaveLength(2);
  });

  it('never drops completed instances, even on a duplicated day', () => {
    const rows = [
      { ...forTask('done1', 't1', MONDAY, MONDAY), status: 'complete' },
      { ...forTask('done2', 't1', MONDAY, MONDAY), status: 'complete' },
      forTask('live', 't1', MONDAY, MONDAY),
    ];
    expect(dedupePerDay(rows)).toHaveLength(3);
  });

  it('leaves a clean list untouched', () => {
    const rows = [forTask('a', 't1', MONDAY, MONDAY)];
    expect(dedupePerDay(rows)).toBe(rows);
  });
});

describe('reconcile', () => {
  it('never lists the same task twice on one day', () => {
    // A week-start change shifts the key boundary and can double a task up.
    const tasks = [task('t1', 7)];
    const monday = reconcile(tasks, [], MONDAY, { weekStartsOn: 1 });
    const both = reconcile(tasks, monday.instances, MONDAY, { weekStartsOn: 0 });

    const today = instancesForDate(both.instances, MONDAY);
    expect(today).toHaveLength(1);
  });

  it('generates, rolls forward and caps in one pass', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task(`t${i}`, 7));
    const { instances } = reconcile(tasks, [], MONDAY, settings);
    expect(instancesForDate(instances, MONDAY)).toHaveLength(WEEKDAY_CAP);
  });

  it('reports no change when there is nothing to do', () => {
    const first = reconcile([task('t1', 2)], [], MONDAY, settings);
    const second = reconcile([task('t1', 2)], first.instances, MONDAY, settings);
    expect(second.changed).toBe(false);
  });

  it('gives an empty day when there are no tasks at all', () => {
    const { instances } = reconcile([], [], MONDAY, settings);
    expect(instancesForDate(instances, MONDAY)).toEqual([]);
  });
});
