import { addDays, dayOfWeek, isWeekend, startOfWeek, todayISO } from './dates.js';

/* The scheduling engine.

   Every function here is pure: it takes state in and hands new state back,
   which is what makes the rollover and cap rules testable without a browser
   or a database. `reconcile()` is the single entry point the app calls.

   The rules, in the order they apply:
     1. Spread — a task set to N times a week gets N slots spread evenly
        across that week (3×/week lands roughly Mon/Wed/Fri, not Mon/Tue/Wed).
     2. Roll forward — anything still incomplete from a past day moves to today
        rather than being missed. Its original due date is kept, because that
        is what says how long it has been waiting.
     3. Cap — a weekday holds at most WEEKDAY_CAP tasks. Weekends are uncapped.
        When a day is over its cap, the task that has waited the *shortest*
        time is the one pushed to tomorrow, and the push cascades day by day
        until everything has a home. */

export const WEEKDAY_CAP = 5;

/** How far ahead instances are planned. Covers a month view. */
const WINDOW_DAYS = 28;

/** Safety bound on the cascade; weekends being uncapped guarantees it ends. */
const MAX_CASCADE_DAYS = 120;

/**
 * Which offsets from the start of the week a task falls on.
 * Spreads N occurrences as evenly as 7 days allow.
 * @param {number} timesPerWeek 1–7
 * @returns {number[]} day offsets, 0 = first day of the week
 */
export function weekSlots(timesPerWeek) {
  const n = Math.max(1, Math.min(7, Math.round(timesPerWeek)));
  const slots = [];
  for (let i = 0; i < n; i += 1) {
    const offset = Math.round((i * 7) / n);
    if (!slots.includes(offset)) slots.push(offset);
  }
  // Rounding can collide for some counts; fill any shortfall with free days.
  for (let d = 0; slots.length < n && d < 7; d += 1) {
    if (!slots.includes(d)) slots.push(d);
  }
  return slots.sort((a, b) => a - b);
}

function instanceKey(taskId, weekStart, slot) {
  return `${taskId}|${weekStart}|${slot}`;
}

/**
 * Create any instances the planning window calls for that don't exist yet.
 * Existing instances are never touched — a task's frequency changing only
 * affects weeks not yet generated.
 */
export function generateInstances(tasks, instances, today, settings) {
  const existing = new Set(instances.map((i) => i.key));
  const created = [];

  const firstWeek = startOfWeek(today, settings.weekStartsOn ?? 1);
  const weeksToCover = Math.ceil(WINDOW_DAYS / 7) + 1;

  for (const task of tasks) {
    if (task.active === false) continue;

    for (let w = 0; w < weeksToCover; w += 1) {
      const weekStart = addDays(firstWeek, w * 7);

      for (const slot of weekSlots(task.timesPerWeek)) {
        const date = addDays(weekStart, slot);
        // Don't create instances for days already gone.
        if (date < today) continue;
        // Nothing is scheduled while a task is paused.
        if (task.pausedUntil && date < task.pausedUntil) continue;

        const key = instanceKey(task.id, weekStart, slot);
        if (existing.has(key)) continue;

        existing.add(key);
        created.push({
          id: key,
          key,
          taskId: task.id,
          scheduledDate: date,
          originalDueDate: date,
          status: 'incomplete',
          completedAt: null,
        });
      }
    }
  }

  return created.length ? instances.concat(created) : instances;
}

/**
 * Move anything left incomplete on a past day up to today.
 * originalDueDate is deliberately preserved: it is the "waiting since" stamp
 * the cap rule sorts on, and what the calendar uses to show a task as moved.
 */
export function rollForward(instances, today) {
  let changed = false;
  const next = instances.map((inst) => {
    if (inst.status === 'incomplete' && inst.scheduledDate < today) {
      changed = true;
      return { ...inst, scheduledDate: today };
    }
    return inst;
  });
  return changed ? next : instances;
}

/**
 * Collapse repeats of the same task on the same day down to one.
 *
 * Two ways a day ends up with the same task twice: yesterday's undone copy
 * rolls onto a day the task was already scheduled for, or the week-start
 * setting changes and shifts the week boundary the instance keys are built
 * from. Either way, needing to do one task twice in a day is never what was
 * meant, so the extras are dropped — the longest-waiting copy is the one kept,
 * since that's what the cap rule sorts on. Completed instances are history and
 * are never touched.
 */
export function dedupePerDay(instances) {
  const seen = new Map();
  const drop = new Set();

  const incomplete = instances
    .filter((i) => i.status === 'incomplete')
    .sort((a, b) => a.originalDueDate.localeCompare(b.originalDueDate) || a.id.localeCompare(b.id));

  for (const inst of incomplete) {
    const slot = `${inst.taskId}|${inst.scheduledDate}`;
    if (seen.has(slot)) drop.add(inst.id);
    else seen.set(slot, inst.id);
  }

  return drop.size ? instances.filter((i) => !drop.has(i.id)) : instances;
}

/**
 * Enforce the weekday cap, cascading overflow forward a day at a time.
 * Weekends are uncapped, so the cascade always terminates.
 */
export function enforceCap(instances, today, cap = WEEKDAY_CAP) {
  const working = instances.map((i) => ({ ...i }));
  let cursor = today;

  for (let step = 0; step < MAX_CASCADE_DAYS; step += 1) {
    if (!isWeekend(cursor)) {
      const onDay = working.filter(
        (i) => i.status === 'incomplete' && i.scheduledDate === cursor,
      );

      if (onDay.length > cap) {
        // Longest-waiting first, so those keep their place; the newest
        // arrivals (largest originalDueDate) are the ones bumped.
        onDay.sort(
          (a, b) =>
            a.originalDueDate.localeCompare(b.originalDueDate) ||
            a.id.localeCompare(b.id),
        );
        const tomorrow = addDays(cursor, 1);
        for (const inst of onDay.slice(cap)) {
          inst.scheduledDate = tomorrow;
        }
      }
    }

    cursor = addDays(cursor, 1);

    // Nothing left scheduled at or past the cursor — done.
    const remaining = working.some(
      (i) => i.status === 'incomplete' && i.scheduledDate >= cursor,
    );
    if (!remaining) break;
  }

  return working;
}

/**
 * The single entry point: bring stored instances up to date for `today`.
 * @returns {{instances: object[], changed: boolean}}
 */
export function reconcile(tasks, instances, today = todayISO(), settings = {}) {
  const before = JSON.stringify(instances);
  let next = generateInstances(tasks, instances, today, settings);
  next = rollForward(next, today);
  // Dedupe before capping, so collapsed repeats don't count against the cap.
  next = dedupePerDay(next);
  next = enforceCap(next, today, settings.weekdayCap ?? WEEKDAY_CAP);
  // Capping moves tasks between days, which can create fresh collisions.
  next = dedupePerDay(next);
  return { instances: next, changed: JSON.stringify(next) !== before };
}

/** Incomplete instances scheduled for a given day, longest-waiting first. */
export function instancesForDate(instances, date) {
  return instances
    .filter((i) => i.scheduledDate === date && i.status === 'incomplete')
    .sort((a, b) => a.originalDueDate.localeCompare(b.originalDueDate));
}

/** Instances completed on a given day. */
export function completedOnDate(instances, date) {
  return instances.filter(
    (i) => i.status === 'complete' && i.completedAt?.slice(0, 10) === date,
  );
}

/** True when a task has been pushed past the day it was originally due. */
export function wasMoved(instance) {
  return instance.scheduledDate > instance.originalDueDate;
}

/** Day offsets a task occupies, for showing its rhythm in the editor. */
export function describeFrequency(timesPerWeek) {
  const n = Math.max(1, Math.min(7, Math.round(timesPerWeek)));
  if (n === 7) return 'every day';
  if (n === 1) return 'once a week';
  return `${n}× a week`;
}

/** Weekday index (0=Sun) for each slot — used by the calendar preview. */
export function slotWeekdays(timesPerWeek, weekStart) {
  return weekSlots(timesPerWeek).map((s) => dayOfWeek(addDays(weekStart, s)));
}
