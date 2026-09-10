import { el } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { completedOnDate, instancesForDate, wasMoved } from '../lib/schedule.js';
import {
  addDays, formatLong, fromISO, isWeekend, monthOf, orderedDayNames,
  startOfWeek, todayISO,
} from '../lib/dates.js';

/* Calendar grids, built as detachable pieces rather than a whole screen.
   The Today view owns the mode switch and mounts whichever of these it needs,
   so day / week / month are one place in the UI instead of two. */

export function weekStartsOn() {
  return store.state.settings.weekStartsOn ?? 1;
}

function monthTint(iso) {
  return store.state.settings.monthColors[monthOf(iso)] || 'transparent';
}

/* What a day holds, written out.

   Dots said how *much* was on a day but never what, which is no use for
   deciding whether Thursday has room. The names are listed instead, still to
   do first, with anything already done struck through under them. */

/** How many fit before the cell would grow past its neighbours. */
const MONTH_ENTRIES = 4;
const WEEK_ENTRIES = 8;

function entriesFor(date, limit) {
  const pending = instancesForDate(store.state.instances, date, store.state.tasks);
  const done = completedOnDate(store.state.instances, date);
  const all = [...pending, ...done];

  const list = el('div', { class: 'entries' });
  for (const instance of all.slice(0, limit)) {
    const task = store.taskById(instance.taskId);
    if (!task) continue;
    list.append(
      el('span', {
        class: `cal-task${instance.status === 'complete' ? ' done' : ''}`,
        style: `--task:${task.color}`,
        // The chip clips when the name is long, so the full one lives here.
        title: task.name,
        text: task.name,
      }),
    );
  }

  const over = all.length - limit;
  if (over > 0) list.append(el('span', { class: 'cal-more', text: `+${over} more` }));
  return list;
}

function dayCell(date, selected, onSelect, { muted = false, limit = MONTH_ENTRIES } = {}) {
  const classes = ['day-cell'];
  if (date === todayISO()) classes.push('today');
  else if (isWeekend(date)) classes.push('weekend');
  if (date === selected) classes.push('selected');

  return el(
    'button',
    {
      class: classes.join(' '),
      style: `--month-tint:${monthTint(date)}; ${muted ? 'opacity:.42;' : ''}`,
      'aria-label': formatLong(date),
      onClick: () => onSelect(date),
    },
    [el('div', { class: 'n', text: String(fromISO(date).getDate()) }), entriesFor(date, limit)],
  );
}

function dowHeaders() {
  return orderedDayNames(weekStartsOn()).map((name) =>
    el('div', { class: 'dow', text: name }),
  );
}

export function monthGrid(anchor, selected, onSelect) {
  const first = `${anchor.slice(0, 7)}-01`;
  const gridStart = startOfWeek(first, weekStartsOn());
  const grid = el('div', { class: 'month-grid' });

  grid.append(...dowHeaders());
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const outside = date.slice(0, 7) !== anchor.slice(0, 7);
    if (outside && i >= 35) continue;
    grid.append(dayCell(date, selected, onSelect, { muted: outside }));
  }
  return el('div', { class: 'cal-scroll' }, [grid]);
}

export function weekGrid(anchor, selected, onSelect) {
  const start = startOfWeek(anchor, weekStartsOn());
  const names = orderedDayNames(weekStartsOn());
  const strip = el('div', { class: 'week-strip' });

  // Headers and cells go straight into the grid, the same shape the month
  // uses. Wrapping each day in a div made the cell a button inside a block
  // rather than a grid item, and a button sizes to its content — which on a
  // narrow screen collapsed the whole strip to the width of its dates.
  for (let i = 0; i < 7; i += 1) strip.append(el('div', { class: 'dow', text: names[i] }));
  for (let i = 0; i < 7; i += 1) {
    strip.append(dayCell(addDays(start, i), selected, onSelect, { limit: WEEK_ENTRIES }));
  }
  return el('div', { class: 'cal-scroll' }, [strip]);
}

/** Read-only list for a day that isn't today. */
export function dayList(date) {
  const pending = instancesForDate(store.state.instances, date, store.state.tasks);
  const done = completedOnDate(store.state.instances, date);

  if (!pending.length && !done.length) {
    return el('div', { class: 'empty' }, ['Nothing scheduled.']);
  }

  const wrap = el('div', { class: 'stack' });

  for (const instance of pending) {
    const task = store.taskById(instance.taskId);
    if (!task) continue;
    wrap.append(
      el('div', { class: 'task-row', style: `--task:${task.color}` }, [
        el('span', { class: 'task-label', text: task.name }),
        el('div', { class: 'task-meta' }, [
          wasMoved(instance) ? el('span', { class: 'badge moved', text: 'moved' }) : null,
          el('span', { class: 'badge undone', text: 'undone' }),
        ]),
      ]),
    );
  }

  for (const instance of done) {
    const task = store.taskById(instance.taskId);
    if (!task) continue;
    wrap.append(
      el('div', { class: 'task-row', style: `--task:${task.color}; opacity:.65` }, [
        el('span', { class: 'task-label', text: task.name }),
        el('div', { class: 'task-meta' }, [el('span', { class: 'badge done', text: 'done' })]),
      ]),
    );
  }
  return wrap;
}

export function periodTitle(mode, anchor, selected) {
  if (mode === 'month') {
    return fromISO(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (mode === 'day') return formatLong(selected);

  const start = startOfWeek(anchor, weekStartsOn());
  const end = addDays(start, 6);
  const fmt = (iso) =>
    fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}
