import { capturePointer, confetti, el, svg } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { completedOnDate, instancesForDate } from '../lib/schedule.js';
import {
  addDays, addMonths, formatShort, fromISO, startOfMonth, startOfWeek, todayISO,
} from '../lib/dates.js';

/* Tearing a page off.

   The heading stays put and everything below it rips away downward, the way
   you'd tear the written part off a pad and leave the header behind. One
   ragged line is generated per tear and used twice — as the underside of the
   piece that stays and the top of the piece that falls — so both halves share
   the same rip. Underneath is the next page, fresh and blank.

   A torn page isn't final. If a new task turns up for that day, the page is
   restored and can be torn again. Every tear is kept in the archive; the
   stats count completions either way. */

/** Depth of the ragged strip, in px. */
const TEETH = 12;

/** How far you have to pull before it lets go. */
const TEAR_THRESHOLD = 80;

/* ---------- the ragged line ---------- */

/** One rip, as a list of [xPercent, yPx] points across the width. */
function ripPoints() {
  const points = [];
  const steps = 26;
  for (let i = 0; i <= steps; i += 1) {
    points.push([(i / steps) * 100, 2 + Math.random() * (TEETH - 4)]);
  }
  return points;
}

/** The falling piece is clipped so its top edge is the rip. */
function clipBelow(points) {
  const top = points.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}px`).join(', ');
  return `polygon(${top}, 100% 100%, 0% 100%)`;
}

/** The staying piece gets a paper strip shaped to the same rip. */
function stubEdge(points) {
  const width = 100;
  const line = points
    .map(([x, y], i) => `${i ? 'L' : 'M'} ${((x / 100) * width).toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  return svg('svg', {
    class: 'tear-stub-edge',
    viewBox: `0 0 ${width} ${TEETH}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  }, [svg('path', { d: `M 0 0 L ${width} 0 ${line.slice(1)} Z`, fill: 'var(--paper)' })]);
}

/* ---------- what can be torn ---------- */

function dayFinished(date) {
  return (
    instancesForDate(store.state.instances, date).length === 0 &&
    completedOnDate(store.state.instances, date).length > 0
  );
}

/** Every day in a range is finished, or had nothing scheduled at all. */
function rangeFinished(from, to) {
  let anyDone = false;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (instancesForDate(store.state.instances, date).length) return false;
    if (completedOnDate(store.state.instances, date).length) anyDone = true;
  }
  return anyDone;
}

function weekBounds(today) {
  const start = startOfWeek(today, store.state.settings.weekStartsOn ?? 1);
  return [start, addDays(start, 6)];
}

function monthBounds(today) {
  const start = startOfMonth(today);
  return [start, addDays(addMonths(start, 1), -1)];
}

/**
 * A page that was torn but has work on it again comes back. Called before
 * rendering, so adding a task to a finished day puts its page back.
 */
export function refreshTorn(today = todayISO()) {
  const checks = [
    ['day', today, today, today],
    ['week', ...weekBounds(today).slice(0, 1), ...weekBounds(today)],
    ['month', ...monthBounds(today).slice(0, 1), ...monthBounds(today)],
  ];

  let changed = false;
  for (const [kind, key, from, to] of checks) {
    if (!store.isTorn(kind, key)) continue;
    let hasWork = false;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (instancesForDate(store.state.instances, date).length) { hasWork = true; break; }
    }
    if (hasWork) {
      store.untear(kind, key);
      changed = true;
    }
  }
  return changed;
}

/**
 * The biggest thing available to tear, or null. A month beats a week beats a
 * day, so finishing a month offers the month rather than three separate tears.
 *
 * A week is offered as soon as there's nothing left in it — you don't have to
 * wait for Sunday. Tearing isn't final either: add a task to that week and
 * refreshTorn() puts the page back, and it can be torn again once that task is
 * done. The archive entry is replaced rather than doubled.
 */
export function tearable(today = todayISO()) {
  const [monthStart, monthEnd] = monthBounds(today);
  if (!store.isTorn('month', monthStart) && rangeFinished(monthStart, monthEnd)) {
    return {
      kind: 'month',
      key: monthStart,
      from: monthStart,
      to: monthEnd,
      label: fromISO(monthStart).toLocaleDateString(undefined, { month: 'long' }),
    };
  }

  const [weekStart, weekEnd] = weekBounds(today);
  if (!store.isTorn('week', weekStart) && rangeFinished(weekStart, weekEnd)) {
    return {
      kind: 'week',
      key: weekStart,
      from: weekStart,
      to: weekEnd,
      label: `the week of ${formatShort(weekStart)}`,
    };
  }

  if (!store.isTorn('day', today) && dayFinished(today)) {
    return { kind: 'day', key: today, from: today, to: today, label: 'today' };
  }

  return null;
}

/** True when this page has already been torn and nothing has come back. */
export function isTornNow(today = todayISO()) {
  const [monthStart] = monthBounds(today);
  const [weekStart] = weekBounds(today);
  return (
    store.isTorn('day', today) ||
    store.isTorn('week', weekStart) ||
    store.isTorn('month', monthStart)
  );
}

/* ---------- the tear ---------- */

/**
 * @param {HTMLElement} page the part that rips away
 * @param {object} target from tearable()
 * @param {() => void} onTorn
 * @returns {HTMLElement} the zone to put where the page was
 */
export function makeTearZone(page, target, onTorn) {
  const points = ripPoints();

  const fresh = el('div', { class: 'tear-fresh', 'aria-hidden': 'true' });
  const sheet = el('div', { class: 'tear-page' }, [page]);
  const grip = el('div', {
    class: 'tear-grip',
    role: 'button',
    tabindex: '0',
    'aria-label': `Tear off ${target.label}`,
  }, [
    el('span', { class: 'tear-grip-line', 'aria-hidden': 'true' }),
    el('span', { class: 'tear-grip-text', text: `Tear off ${target.label}` }),
  ]);

  const zone = el('div', { class: 'tear-zone' }, [fresh, sheet, grip]);

  let pulling = false;
  let startY = 0;
  let offset = 0;
  let ripping = false;

  function beginRip() {
    if (ripping) return;
    ripping = true;
    // The same rip, used on both halves.
    sheet.style.clipPath = clipBelow(points);
    zone.prepend(stubEdge(points));
    zone.classList.add('ripping');
  }

  function setOffset(value) {
    offset = Math.max(0, value);
    sheet.style.transform = `translateY(${offset}px) rotate(${offset * 0.01}deg)`;
    grip.style.opacity = String(Math.max(0, 1 - offset / 50));
  }

  function finish() {
    sheet.classList.add('torn');
    grip.remove();
    confetti(['var(--butter)', 'var(--sage)', 'var(--rust)', 'var(--ink-blue)']);
    setTimeout(() => {
      store.tearOff(target.kind, target.key, collectPage(target));
      onTorn?.();
    }, 640);
  }

  function release() {
    if (!pulling) return;
    pulling = false;
    if (offset >= TEAR_THRESHOLD) {
      finish();
      return;
    }
    sheet.style.transition = 'transform .3s ease';
    setOffset(0);
    setTimeout(() => {
      sheet.style.transition = '';
      sheet.style.clipPath = '';
      zone.querySelector('.tear-stub-edge')?.remove();
      zone.classList.remove('ripping');
      ripping = false;
      grip.style.opacity = '';
    }, 320);
  }

  grip.addEventListener('pointerdown', (event) => {
    pulling = true;
    startY = event.clientY;
    capturePointer(grip, event.pointerId);
    beginRip();
    event.preventDefault();
  });

  grip.addEventListener('pointermove', (event) => {
    if (!pulling) return;
    setOffset(event.clientY - startY);
  });

  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);

  // Clicking or pressing Enter does the same without the drag.
  grip.addEventListener('click', () => {
    if (offset > 0) return;
    beginRip();
    sheet.style.transition = 'transform .28s ease';
    setOffset(TEAR_THRESHOLD + 10);
    setTimeout(finish, 280);
  });
  grip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      grip.click();
    }
  });

  return zone;
}

/** What went on the page, so the archive can show it later. */
function collectPage(target) {
  const items = [];
  for (let date = target.from; date <= target.to; date = addDays(date, 1)) {
    for (const instance of completedOnDate(store.state.instances, date)) {
      const task = store.taskById(instance.taskId);
      if (task) items.push({ name: task.name, color: task.color, date });
    }
  }
  return { kind: target.kind, key: target.key, label: target.label, items };
}

/** A clean sheet, shown once the page above it has come away. */
export function freshPage() {
  return el('div', { class: 'fresh-page' }, [
    el('span', { class: 'fresh-page-note', text: 'a clean page' }),
  ]);
}
