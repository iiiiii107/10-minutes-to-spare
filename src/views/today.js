import { capturePointer, checkSvg, clear, confetti, el, strikeSvg, svg, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { taskDialog } from './categories.js';
import { pausedBanner } from './pause.js';
import { penPot, toolSvg } from './pot.js';
import { makeTearable, tearable } from './tear.js';
import { TOOLS, pathFromPoints, simplify } from '../lib/tools.js';
import { dayList, monthGrid, monthLegend, periodTitle, weekGrid } from './calendar.js';
import {
  completedOnDate, instancesForDate, shortFrequency, wasMoved,
} from '../lib/schedule.js';
import { currentStreak, completedTotal, milestoneFor } from '../lib/stats.js';
import { addDays, fromISO, todayISO } from '../lib/dates.js';

/* The main view. Day is the working list — the one you actually tick things
   off in. Week and month are the same data zoomed out, so the calendar isn't
   a separate place you have to go.

   Marks are made by dragging a tool from the pot across a row. The line
   follows the drag itself rather than being a canned shape, so a quick swipe
   scrawls and a slow one comes out neat. */

/** Where the nib sits relative to the pointer, matching the drawn tool. */
const NIB_OFFSET_Y = 34;
const NIB_OFFSET_X = 1;
const GRAB_X = 11;
const GRAB_Y = 20;

let mode = 'day';
let selected = todayISO();
let anchor = todayISO();
let mountRoot = null;
let activeTool = null;

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

function completeRow(row, instanceId, color, { instant = false } = {}) {
  if (row.dataset.settled) return;
  row.dataset.settled = '1';
  row.classList.add('done');
  celebrate([color, 'var(--butter)', 'var(--sage)', 'var(--ink-blue)']);

  setTimeout(() => {
    row.classList.add('clearing');
    setTimeout(() => store.setInstanceStatus(instanceId, 'complete'), 480);
  }, instant ? 60 : 420);
}

function taskRow(instance, seed) {
  const task = store.taskById(instance.taskId);
  if (!task) return null;

  const row = el('div', {
    class: 'task-row',
    style: `--task:${task.color}`,
    dataset: { instance: instance.id },
  });

  // The task row is the canvas: marks are drawn here, in this row's own pixel
  // space, and stored with this task so they're still here next time.
  const ink = svg('svg', { class: 'ink', 'aria-hidden': 'true' });
  for (const mark of instance.marks || []) {
    ink.append(svg('path', {
      d: mark.d,
      fill: 'none',
      stroke: mark.ink,
      'stroke-width': String(mark.width),
      'stroke-opacity': String(mark.opacity),
      'stroke-linecap': mark.cap || 'round',
      'stroke-linejoin': 'round',
    }));
  }

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
      el('span', { class: 'freq-badge', text: shortFrequency(task) }),
    ]),
    ink,
  );
  return row;
}

/* ---------- the held tool ---------- */

function heldTool(surface, toolId) {
  const hand = el('div', { class: 'hand-tool', dataset: { tool: toolId } }, [toolSvg(toolId)]);
  surface.append(hand);
  hand.style.left = `${Math.max(8, surface.clientWidth - 46)}px`;
  hand.style.top = '0px';

  const tool = TOOLS[toolId];
  /** Points collected per row while the nib is inside it. */
  const strokes = new Map();
  let dragging = false;

  function inkFor(row) {
    if (!strokes.has(row)) strokes.set(row, { points: [], path: null });
    const stroke = strokes.get(row);
    if (!stroke.path) {
      const layer = row.querySelector('.ink');
      stroke.path = svg('path', {
        fill: 'none',
        stroke: tool.ink || getComputedStyle(row).getPropertyValue('--task').trim(),
        'stroke-width': String(tool.width),
        'stroke-opacity': String(tool.opacity),
        'stroke-linecap': tool.id === 'highlighter' ? 'butt' : 'round',
        'stroke-linejoin': 'round',
      });
      layer.append(stroke.path);
    }
    return stroke;
  }

  function apply() {
    for (const [row, stroke] of strokes) {
      if (stroke.points.length < 2) continue;
      const instanceId = row.dataset.instance;
      const color = getComputedStyle(row).getPropertyValue('--task').trim();

      if (tool.completes) {
        // The freehand line stays on screen while the row clears away.
        row.classList.add('hand-marked');
        completeRow(row, instanceId, tool.ink || color, { instant: true });
      } else {
        // Highlighter and crayon change nothing — they just leave colour on
        // the task, and that mark is kept.
        store.addMark(instanceId, {
          d: stroke.path.getAttribute('d'),
          ink: tool.ink || color,
          width: tool.width,
          opacity: tool.opacity,
          cap: tool.id === 'highlighter' ? 'butt' : 'round',
        });
      }
    }
    strokes.clear();
  }

  hand.addEventListener('pointerdown', (event) => {
    dragging = true;
    capturePointer(hand, event.pointerId);
    hand.classList.add('drawing');
    event.preventDefault();
  });

  hand.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const box = surface.getBoundingClientRect();
    hand.style.left = `${event.clientX - box.left - GRAB_X}px`;
    hand.style.top = `${event.clientY - box.top - GRAB_Y}px`;

    const nibX = event.clientX + NIB_OFFSET_X;
    const nibY = event.clientY + NIB_OFFSET_Y;

    for (const row of surface.querySelectorAll('.task-row')) {
      const rect = row.getBoundingClientRect();
      const inside =
        nibX >= rect.left && nibX <= rect.right &&
        nibY >= rect.top && nibY <= rect.bottom;
      if (!inside) continue;

      if (tool.erases) {
        // The eraser wipes a task's marks off rather than leaving one.
        if (row.querySelector('.ink')?.childElementCount) {
          row.querySelector('.ink').replaceChildren();
          store.clearMarks(row.dataset.instance);
        }
        row.classList.remove('hand-marked');
        continue;
      }

      const stroke = inkFor(row);
      stroke.points.push({ x: nibX - rect.left, y: nibY - rect.top });
      stroke.path.setAttribute('d', pathFromPoints(simplify(stroke.points)));
    }
  });

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    hand.classList.remove('drawing');
    apply();
  };
  hand.addEventListener('pointerup', stop);
  hand.addEventListener('pointercancel', stop);

  return hand;
}

/* ---------- done summary ---------- */

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

/** The working list for today: the tools, the rows, and whatever's finished. */
function todayBody(card) {
  const date = todayISO();
  const pending = instancesForDate(store.state.instances, date);

  if (!store.state.tasks.length) return;

  if (!pending.length) {
    card.append(el('div', { class: 'empty' }, ['All clear for today ✦']));
  } else {
    const surface = el('div', { class: 'pen-surface' });

    // On a phone the pot is a small row above the list rather than a jar.
    surface.append(
      el('div', { class: 'pen-bar' }, [
        penPot(activeTool, pickTool, true),
        el('span', {
          class: 'pen-hint',
          text: activeTool
            ? `Drag the ${TOOLS[activeTool].label.toLowerCase()} across a task.`
            : 'Tap a box, or pick up a tool.',
        }),
      ]),
    );

    pending.forEach((instance, index) => {
      const row = taskRow(instance, index);
      if (row) surface.append(row);
    });

    card.append(surface);
    if (activeTool) heldTool(surface, activeTool);
  }

  const summary = doneSummary(date);
  if (summary) card.append(summary);
}

function pickTool(id) {
  activeTool = activeTool === id ? null : id;
  rerender();
}

/* ---------- navigation ---------- */

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

  document.body.dataset.view = mode === 'day' ? 'today' : 'calendar';

  if (store.state.tasks.length) root.append(pausedBanner());

  const modes = el(
    'div',
    { class: 'seg seg-wide', role: 'tablist', 'aria-label': 'Zoom' },
    ['day', 'week', 'month'].map((m) =>
      el('button', {
        class: 'seg-item',
        role: 'tab',
        text: m,
        'aria-selected': String(mode === m),
        onClick: () => {
          mode = m;
          if (m === 'day') { selected = today; anchor = today; }
          rerender();
        },
      }),
    ),
  );

  card.append(
    el('div', { class: 'cal-head' }, [
      isToday
        ? el('h2', { text: 'Today' })
        : el('div', { class: 'row' }, [
            el('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Previous', onClick: () => step(-1) }),
            el('span', { class: 'cal-title', text: periodTitle(mode, anchor, selected) }),
            el('button', { class: 'icon-btn', text: '›', 'aria-label': 'Next', onClick: () => step(1) }),
          ]),
      isToday && store.state.categories.length
        ? el('button', {
            class: 'btn btn-primary btn-sm',
            text: '+ Add task',
            onClick: () => taskDialog(null, undefined, true),
          })
        : null,
    ]),
    el('div', { style: 'margin-bottom:16px' }, [modes]),
  );

  if (mode === 'month') {
    card.append(monthGrid(anchor, selected, selectDay), monthLegend(anchor));
  } else if (mode === 'week') {
    card.append(weekGrid(anchor, selected, selectDay), monthLegend(anchor));
  } else if (isToday) {
    todayBody(card);
  } else {
    card.append(
      dayList(selected),
      el('div', { style: 'margin-top:16px' }, [
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: '← Back to today',
          onClick: () => selectDay(today),
        }),
      ]),
    );
  }

  // The pot stands to the right of the sheet on a computer. Without it the
  // board is a single column, or the calendar ends up squeezed into the
  // pot's width.
  const showPot = isToday && store.state.tasks.length > 0;
  const board = el('div', { class: `board${showPot ? ' board-with-pot' : ''}` }, [
    el('div', { class: 'board-main' }, [card]),
    showPot ? el('aside', { class: 'board-side' }, [penPot(activeTool, pickTool)]) : null,
  ]);

  root.append(board);

  // A finished day, week or month can be pulled off the pad.
  if (isToday) {
    const target = tearable(today);
    if (target) makeTearable(card, target, () => rerender());
  }
}
