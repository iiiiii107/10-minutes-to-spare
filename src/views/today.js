import { checkSvg, clear, confetti, el, penSvg, strikeSvg, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { taskDialog } from './categories.js';
import {
  dayList, monthGrid, monthLegend, periodTitle, weekGrid,
} from './calendar.js';
import { completedOnDate, instancesForDate, wasMoved } from '../lib/schedule.js';
import { currentStreak, completedTotal, milestoneFor } from '../lib/stats.js';
import { addDays, fromISO, todayISO } from '../lib/dates.js';

/* The main view. Day is the working list — the one you actually tick things
   off in. Week and month are the same data zoomed out, so the calendar isn't
   a separate place you have to go. */

/** How far the nib sits from the pointer, matching the pen's drawn geometry. */
const NIB_OFFSET_Y = 52;
const NIB_OFFSET_X = 2;

let mode = 'day';
let selected = todayISO();
let anchor = todayISO();
let mountRoot = null;

function rerender() {
  if (mountRoot) renderToday(mountRoot);
}

function celebrate(colors) {
  const streak = currentStreak(store.state.instances);
  const total = completedTotal(store.state.instances);
  const milestone = milestoneFor(streak, total);
  if (milestone) {
    confetti(colors);
    toast(milestone);
  }
}

/** Shared by tap and pen: mark done, animate, then persist. */
function completeRow(row, instanceId, color) {
  if (row.classList.contains('done')) return;
  row.classList.add('done');
  celebrate([color, 'var(--butter)', 'var(--sage)', 'var(--ink-blue)']);

  // Let the strike finish drawing before the row leaves.
  setTimeout(() => {
    row.classList.add('clearing');
    setTimeout(() => store.setInstanceStatus(instanceId, 'complete'), 480);
  }, 420);
}

function taskRow(instance, seed) {
  const task = store.taskById(instance.taskId);
  if (!task) return null;

  const row = el('div', {
    class: 'task-row',
    style: `--task:${task.color}`,
    dataset: { instance: instance.id },
  });

  row.append(
    el('button', {
      class: 'check',
      'aria-label': `Mark "${task.name}" done`,
      onClick: () => completeRow(row, instance.id, task.color),
    }, [checkSvg()]),
    el('span', { class: 'task-label' }, [
      el('span', { class: 'task-name', text: task.name }),
      strikeSvg(seed),
    ]),
    el('div', { class: 'task-meta' }, [
      wasMoved(instance) ? el('span', { class: 'badge moved', text: 'moved' }) : null,
      el('span', { class: 'freq-badge', text: `${task.timesPerWeek}×/wk` }),
    ]),
  );
  return row;
}

function attachPen(surface, button, hint) {
  const pen = penSvg();
  surface.append(pen);
  let armed = false;
  let dragging = false;

  button.addEventListener('click', () => {
    armed = !armed;
    surface.classList.toggle('armed', armed);
    pen.classList.toggle('active', armed);
    button.textContent = armed ? 'Put pen down' : 'Update list';
    hint.textContent = armed
      ? 'Drag the pen across a task to cross it off.'
      : 'Tap a box, or pick up the pen.';
    if (armed) {
      pen.style.left = `${surface.clientWidth - 74}px`;
      pen.style.top = '0px';
    }
  });

  pen.addEventListener('pointerdown', (event) => {
    dragging = true;
    pen.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  pen.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const box = surface.getBoundingClientRect();
    pen.style.left = `${event.clientX - box.left - 15}px`;
    pen.style.top = `${event.clientY - box.top - 30}px`;

    const nibX = event.clientX + NIB_OFFSET_X;
    const nibY = event.clientY + NIB_OFFSET_Y;

    for (const row of surface.querySelectorAll('.task-row:not(.done)')) {
      const rect = row.getBoundingClientRect();
      const inside =
        nibX >= rect.left && nibX <= rect.right &&
        nibY >= rect.top && nibY <= rect.bottom;
      if (inside) {
        const color = getComputedStyle(row).getPropertyValue('--task').trim();
        completeRow(row, row.dataset.instance, color);
      }
    }
  });

  const stop = () => { dragging = false; };
  pen.addEventListener('pointerup', stop);
  pen.addEventListener('pointercancel', stop);
}

function doneSummary(date) {
  const done = completedOnDate(store.state.instances, date);
  if (!done.length) return null;

  const list = el('div', { class: 'stack', style: 'display:none; margin-top:10px' });
  for (const instance of done) {
    const task = store.taskById(instance.taskId);
    if (!task) continue;
    list.append(
      el('div', { class: 'task-row done', style: `--task:${task.color}` }, [
        el('button', {
          class: 'check',
          'aria-label': `Mark "${task.name}" not done`,
          onClick: () => store.setInstanceStatus(instance.id, 'incomplete'),
        }, [checkSvg()]),
        el('span', { class: 'task-label' }, [
          el('span', { class: 'task-name', text: task.name }),
          strikeSvg(0),
        ]),
      ]),
    );
  }

  let open = false;
  const toggle = el('button', {
    class: 'done-toggle',
    'aria-expanded': 'false',
    text: `✓ ${done.length} done today`,
    onClick: () => {
      open = !open;
      list.style.display = open ? 'flex' : 'none';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open
        ? `✕ hide ${done.length} done today`
        : `✓ ${done.length} done today`;
    },
  });

  return el('div', { class: 'done-summary' }, [toggle, list]);
}

/** The working list for today: pen, quick add, and tickable rows. */
function todayBody(card) {
  const date = todayISO();
  const pending = instancesForDate(store.state.instances, date);

  if (!store.state.tasks.length) {
    card.append(
      el('div', { class: 'empty' }, [
        'Nothing set up yet.',
        el('div', { class: 'hint', text: 'Add a list and a few small tasks to get started.' }),
        el('div', { style: 'margin-top:16px' }, [
          el('button', {
            class: 'btn btn-primary',
            text: 'Go to lists',
            onClick: () => { location.hash = '#/lists'; },
          }),
        ]),
      ]),
    );
    return;
  }

  if (!pending.length) {
    card.append(el('div', { class: 'empty' }, ['All clear for today ✦']));
  } else {
    const surface = el('div', { class: 'pen-surface' });
    const hint = el('span', { class: 'pen-hint', text: 'Tap a box, or pick up the pen.' });
    const penButton = el('button', { class: 'btn btn-ghost btn-sm', text: 'Update list' });

    surface.append(el('div', { class: 'pen-bar' }, [penButton, hint]));
    pending.forEach((instance, index) => {
      const row = taskRow(instance, index);
      if (row) surface.append(row);
    });

    card.append(surface);
    attachPen(surface, penButton, hint);
  }

  const summary = doneSummary(date);
  if (summary) card.append(summary);
}

function step(direction) {
  if (mode === 'month') {
    const date = fromISO(anchor);
    date.setDate(1);
    date.setMonth(date.getMonth() + direction);
    anchor = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (mode === 'week') {
    anchor = addDays(anchor, direction * 7);
  } else {
    selected = addDays(selected, direction);
    anchor = selected;
  }
  rerender();
}

function selectDay(date) {
  selected = date;
  anchor = date;
  mode = 'day';
  rerender();
}

export function renderToday(root) {
  mountRoot = root;
  clear(root);
  store.refreshSchedule();

  const today = todayISO();
  const isToday = mode === 'day' && selected === today;
  const card = el('div', { class: 'card paper' });

  // Zooming out to week or month swaps the page to ledger paper, so the
  // surface still tells you which mode you're in.
  document.body.dataset.view = mode === 'day' ? 'today' : 'calendar';

  const modes = el(
    'div',
    { class: 'cal-modes' },
    ['day', 'week', 'month'].map((m) =>
      el('button', {
        class: 'cal-mode',
        text: m,
        'aria-pressed': String(mode === m),
        onClick: () => {
          mode = m;
          if (m === 'day') { selected = today; anchor = today; }
          rerender();
        },
      }),
    ),
  );

  // On today itself the heading is just "Today"; elsewhere it's the date,
  // with arrows to step through.
  card.append(
    el('div', { class: 'cal-head' }, [
      // The masthead already carries today's date, so the heading doesn't.
      isToday
        ? el('div', { class: 'row' }, [el('h2', { text: 'Today' })])
        : el('div', { class: 'row' }, [
            el('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Previous', onClick: () => step(-1) }),
            el('span', { class: 'cal-title', text: periodTitle(mode, anchor, selected) }),
            el('button', { class: 'icon-btn', text: '›', 'aria-label': 'Next', onClick: () => step(1) }),
          ]),
      el('div', { class: 'row', style: 'gap:8px' }, [
        isToday && store.state.categories.length
          ? el('button', {
              class: 'btn btn-primary btn-sm',
              text: '+ Add task',
              onClick: () => taskDialog(null, undefined, true),
            })
          : null,
        modes,
      ]),
    ]),
  );

  if (mode === 'month') {
    card.append(monthGrid(anchor, selected, selectDay), monthLegend(anchor));
  } else if (mode === 'week') {
    card.append(weekGrid(anchor, selected, selectDay), monthLegend(anchor));
  } else if (isToday) {
    todayBody(card);
  } else {
    card.append(dayList(selected));
    card.append(
      el('div', { style: 'margin-top:16px' }, [
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: '← Back to today',
          onClick: () => selectDay(today),
        }),
      ]),
    );
  }

  root.append(card);
}
