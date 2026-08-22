import { el } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { completedOnDate, instancesForDate, wasMoved } from '../lib/schedule.js';
import {
  addDays, formatLong, fromISO, isWeekend, monthOf, startOfWeek, todayISO,
} from '../lib/dates.js';

/* Calendar grids, built as detachable pieces rather than a whole screen.
   The Today view owns the mode switch and mounts whichever of these it needs,
   so day / week / month are one place in the UI instead of two. */

const DOW_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekStartsMonday() {
  return store.state.settings.weekStartsMonday !== false;
}

function monthTint(iso) {
  return store.state.settings.monthColors[monthOf(iso)] || 'transparent';
}

function dotsFor(date) {
  const pending = instancesForDate(store.state.instances, date);
  const done = completedOnDate(store.state.instances, date);
  const dots = el('div', { class: 'dots' });

  for (const instance of [...done, ...pending].slice(0, 6)) {
    const task = store.taskById(instance.taskId);
    if (!task) continue;
    dots.append(
      el('span', {
        style: `background:${task.color}; opacity:${instance.status === 'complete' ? 0.35 : 1}`,
      }),
    );
  }
  return dots;
}

function dayCell(date, selected, onSelect, { muted = false } = {}) {
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
    [el('div', { class: 'n', text: String(fromISO(date).getDate()) }), dotsFor(date)],
  );
}

function dowHeaders() {
  const names = weekStartsMonday() ? DOW_MON : DOW_SUN;
  return names.map((name) => el('div', { class: 'dow', text: name }));
}

export function monthGrid(anchor, selected, onSelect) {
  const first = `${anchor.slice(0, 7)}-01`;
  const gridStart = startOfWeek(first, weekStartsMonday());
  const grid = el('div', { class: 'month-grid' });

  grid.append(...dowHeaders());
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const outside = date.slice(0, 7) !== anchor.slice(0, 7);
    if (outside && i >= 35) continue;
    grid.append(dayCell(date, selected, onSelect, { muted: outside }));
  }
  return grid;
}

export function weekGrid(anchor, selected, onSelect) {
  const start = startOfWeek(anchor, weekStartsMonday());
  const names = weekStartsMonday() ? DOW_MON : DOW_SUN;
  const strip = el('div', { class: 'week-strip' });

  for (let i = 0; i < 7; i += 1) {
    strip.append(
      el('div', { style: 'flex:1; min-width:0' }, [
        el('div', { class: 'dow', text: names[i] }),
        dayCell(addDays(start, i), selected, onSelect),
      ]),
    );
  }
  return strip;
}

/** Read-only list for a day that isn't today. */
export function dayList(date) {
  const pending = instancesForDate(store.state.instances, date);
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

  const start = startOfWeek(anchor, weekStartsMonday());
  const end = addDays(start, 6);
  const fmt = (iso) =>
    fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function monthLegend(anchor) {
  const monthName = fromISO(anchor).toLocaleDateString(undefined, { month: 'long' });
  return el('div', { class: 'month-legend' }, [
    el('i', { style: `background:${monthTint(anchor)}` }),
    `${monthName} — set its colour in Settings`,
  ]);
}
