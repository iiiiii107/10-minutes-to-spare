import { capturePointer, confetti, el, svg } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { completedOnDate, instancesForDate } from '../lib/schedule.js';
import {
  addDays, addMonths, formatShort, fromISO, startOfMonth, startOfWeek, todayISO,
} from '../lib/dates.js';

/* Tearing a page off.

   A finished day can be torn away like a sheet from a desk pad. When the last
   day of a week is finished and nothing is left outstanding anywhere in that
   week, the whole week can go; same for a month. The torn edge is a real
   ragged line — one random path per tear, so no two look identical. */

/** Height of the ragged strip, in px. */
const TEETH_HEIGHT = 14;

/** How far you have to pull before it lets go. */
const TEAR_THRESHOLD = 90;

/** A ragged edge, generated fresh so each tear looks hand-torn. */
function tornEdgePath(width, seed = Math.random) {
  const points = [];
  const step = 11;
  for (let x = 0; x <= width; x += step) {
    points.push([x, 3 + seed() * (TEETH_HEIGHT - 6)]);
  }
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return `${line} L ${width} ${TEETH_HEIGHT} L 0 ${TEETH_HEIGHT} Z`;
}

function tornEdge(width) {
  return svg('svg', {
    class: 'tear-edge',
    viewBox: `0 0 ${width} ${TEETH_HEIGHT}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  }, [svg('path', { d: tornEdgePath(width), fill: 'var(--paper)' })]);
}

/* ---------- what can be torn ---------- */

function dayFinished(date) {
  const pending = instancesForDate(store.state.instances, date);
  const done = completedOnDate(store.state.instances, date);
  return pending.length === 0 && done.length > 0;
}

/** Every day in a range is either finished or had nothing scheduled at all. */
function rangeFinished(from, to) {
  let anyDone = false;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (instancesForDate(store.state.instances, date).length) return false;
    if (completedOnDate(store.state.instances, date).length) anyDone = true;
  }
  return anyDone;
}

/**
 * The biggest thing available to tear right now, or null.
 * A month beats a week beats a day, so finishing the last day of a month
 * offers the month rather than making you tear three times.
 */
export function tearable(today = todayISO()) {
  const weekStartsOn = store.state.settings.weekStartsOn ?? 1;

  const monthStart = startOfMonth(today);
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  if (
    today === monthEnd &&
    !store.isTorn('month', monthStart) &&
    rangeFinished(monthStart, monthEnd)
  ) {
    return {
      kind: 'month',
      key: monthStart,
      label: fromISO(monthStart).toLocaleDateString(undefined, { month: 'long' }),
      note: 'a whole month, done',
    };
  }

  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = addDays(weekStart, 6);
  if (
    today === weekEnd &&
    !store.isTorn('week', weekStart) &&
    rangeFinished(weekStart, weekEnd)
  ) {
    return {
      kind: 'week',
      key: weekStart,
      label: `${formatShort(weekStart)} – ${formatShort(weekEnd)}`,
      note: 'the whole week, done',
    };
  }

  if (!store.isTorn('day', today) && dayFinished(today)) {
    return { kind: 'day', key: today, label: 'Today', note: 'all done' };
  }

  return null;
}

/* ---------- the tear itself ---------- */

/**
 * Wraps a card so it can be pulled downward and torn off.
 * @param {HTMLElement} card the sheet being torn
 * @param {object} target from tearable()
 * @param {() => void} onTorn called once the sheet has gone
 */
export function makeTearable(card, target, onTorn) {
  const wrap = el('div', { class: 'tear-wrap' });
  card.replaceWith(wrap);

  const sheet = el('div', { class: 'tear-sheet' }, [card]);
  const stub = el('div', { class: 'tear-stub' }, [
    el('span', { class: 'tear-stub-text', text: target.note }),
  ]);

  const grip = el('div', {
    class: 'tear-grip',
    role: 'button',
    tabindex: '0',
    'aria-label': `Tear off ${target.label}`,
  }, [
    el('span', { class: 'tear-grip-line', 'aria-hidden': 'true' }),
    el('span', { class: 'tear-grip-text', text: `Tear off ${target.label.toLowerCase()}` }),
  ]);

  wrap.append(stub, sheet, grip);

  let pulling = false;
  let startY = 0;
  let offset = 0;
  let edge = null;

  function showEdge() {
    if (edge) return;
    edge = tornEdge(Math.round(sheet.getBoundingClientRect().width) || 320);
    sheet.append(edge);
    sheet.classList.add('tearing');
  }

  function setOffset(value) {
    offset = Math.max(0, value);
    sheet.style.transform = `translateY(${offset}px) rotate(${offset * 0.012}deg)`;
    grip.style.opacity = String(Math.max(0, 1 - offset / 60));
  }

  function finish() {
    sheet.classList.add('torn');
    grip.remove();
    confetti(['var(--butter)', 'var(--sage)', 'var(--rust)', 'var(--ink-blue)']);
    setTimeout(() => {
      store.tearOff(target.kind, target.key);
      onTorn?.();
    }, 620);
  }

  function release() {
    if (!pulling) return;
    pulling = false;
    if (offset >= TEAR_THRESHOLD) {
      finish();
    } else {
      sheet.classList.remove('tearing');
      sheet.style.transition = 'transform .3s ease';
      setOffset(0);
      setTimeout(() => { sheet.style.transition = ''; edge?.remove(); edge = null; }, 320);
      grip.style.opacity = '';
    }
  }

  grip.addEventListener('pointerdown', (event) => {
    pulling = true;
    startY = event.clientY;
    capturePointer(grip, event.pointerId);
    showEdge();
    event.preventDefault();
  });

  grip.addEventListener('pointermove', (event) => {
    if (!pulling) return;
    setOffset(event.clientY - startY);
  });

  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);

  // Keyboard and plain clicks get the same result without the drag.
  grip.addEventListener('click', () => {
    if (offset > 0) return;
    showEdge();
    sheet.style.transition = 'transform .25s ease';
    setOffset(TEAR_THRESHOLD);
    setTimeout(finish, 260);
  });
  grip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      grip.click();
    }
  });

  return wrap;
}
