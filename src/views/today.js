import { capturePointer, checkSvg, clear, confetti, el, modal, strikeSvg, svg, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { taskDialog } from './categories.js';
import { pausedBanner } from './pause.js';
import { penPot, toolSvg } from './pot.js';
import { freshPage, isTornNow, makeTearZone, refreshTorn, tearable } from './tear.js';
import { TOOLS, TOOL_LIMITS, pathFromPoints, simplify, toolWith } from '../lib/tools.js';
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

/* The pot is out of the way until you reach for it — the little pen beside
   the heading brings it out. It stays out until you put it back, so a session
   of marking things up isn't one click per stroke. */
let potOpen = false;

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

/* ---------- setting a tool up ---------- */

/** A few ready-made inks, so picking one is usually a single click. */
const INKS = [
  '#EFD87B', '#E8C05F', '#B8714C', '#C58E5C',
  '#7E9A70', '#9CB88C', '#7C93B8', '#5B7291',
  '#8C6A5A', '#302E28',
];

/**
 * Double-clicking the highlighter or the crayon opens this: pick its colour
 * and how broad it draws. Marks already on a task keep the settings they were
 * drawn with — this changes the next stroke, not the last one.
 */
function toolStyleDialog(id) {
  const tool = TOOLS[id];
  const limits = TOOL_LIMITS[id];
  const current = { ...store.state.settings.toolStyles?.[id] };
  let ink = current.ink || tool.ink;
  let width = Number(current.width) || tool.width;

  const preview = svg('svg', { class: 'tool-preview', viewBox: '0 0 220 44', 'aria-hidden': 'true' });
  const stroke = svg('path', {
    d: 'M 12 30 Q 60 14 108 26 T 208 18',
    fill: 'none',
    'stroke-linecap': id === 'highlighter' ? 'butt' : 'round',
  });
  preview.append(stroke);

  function draw() {
    stroke.setAttribute('stroke', ink);
    stroke.setAttribute('stroke-width', String(width));
    stroke.setAttribute('stroke-opacity', String(tool.opacity));
  }
  draw();

  const swatches = el('div', { class: 'ink-row' });
  const custom = el('input', {
    type: 'color',
    value: ink,
    'aria-label': 'Any other colour',
    onInput: (event) => {
      ink = event.target.value;
      for (const node of swatches.children) node.setAttribute('aria-pressed', 'false');
      draw();
    },
  });

  for (const value of INKS) {
    swatches.append(
      el('button', {
        type: 'button',
        class: 'ink-swatch',
        style: `--ink-swatch:${value}`,
        'aria-label': value,
        'aria-pressed': String(value.toLowerCase() === String(ink).toLowerCase()),
        onClick: (event) => {
          ink = value;
          for (const node of swatches.children) node.setAttribute('aria-pressed', 'false');
          event.currentTarget.setAttribute('aria-pressed', 'true');
          custom.value = value;
          draw();
        },
      }),
    );
  }

  const readout = el('span', { class: 'stepper-value', text: `${width}px` });
  const slider = el('input', {
    type: 'range',
    min: String(limits.min),
    max: String(limits.max),
    step: '0.5',
    value: String(width),
    'aria-label': 'Width',
    onInput: (event) => {
      width = Number(event.target.value);
      readout.textContent = `${width}px`;
      draw();
    },
  });

  const body = el('div', {}, [
    el('p', { class: 'muted', style: 'margin-bottom:14px', text: tool.hint }),
    preview,
    el('div', { class: 'field' }, [
      el('label', { text: 'Colour' }),
      el('div', { class: 'ink-picker' }, [swatches, custom]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Width' }),
      el('div', { class: 'slider-row' }, [slider, readout]),
    ]),
  ]);

  modal({
    title: tool.label,
    body,
    actions: [
      {
        label: 'Reset',
        onClick: () => {
          store.updateSettings({
            toolStyles: {
              ...store.state.settings.toolStyles,
              [id]: { ink: tool.ink, width: tool.width },
            },
          });
        },
      },
      {
        label: 'Save',
        class: 'btn btn-primary',
        onClick: () => {
          store.updateSettings({
            toolStyles: { ...store.state.settings.toolStyles, [id]: { ink, width } },
          });
        },
      },
    ],
  });
}

/**
 * The little pen beside the heading. It fetches the pot out and puts it away
 * again, so the tools are there when you want them and out of the way when
 * you don't.
 */
function potToggle() {
  return el('button', {
    class: 'pot-toggle',
    'aria-pressed': String(potOpen),
    'aria-label': potOpen ? 'Put the tools away' : 'Get the tools out',
    title: potOpen ? 'Put the tools away' : 'Get the tools out',
    onClick: () => {
      potOpen = !potOpen;
      rerender();
    },
  }, [
    svg('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
      // a pen held at an angle, nib down
      svg('path', {
        d: 'M5.6 19.2 L7.4 14.6 L16.8 5.2 L19 7.4 L9.6 16.8 Z',
        fill: 'var(--paper)', stroke: 'currentColor', 'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      }),
      svg('path', {
        d: 'M16.8 5.2 L18 4 A1.6 1.6 0 0 1 20.2 6.2 L19 7.4 Z',
        fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      }),
      svg('path', { d: 'M7.4 14.6 L9.6 16.8', stroke: 'currentColor', 'stroke-width': '1.3' }),
      svg('path', {
        d: 'M5.6 19.2 L4.8 20.8 L6.6 20.2 Z',
        fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.2',
        'stroke-linejoin': 'round',
      }),
    ]),
  ]);
}

/** The pot, wired to this view's state. */
function pot(compact = false) {
  return penPot({
    onDragStart: startToolDrag,
    onAdjust: toolStyleDialog,
    styles: store.state.settings.toolStyles,
    compact,
  });
}

/* ---------- dragging a tool out of the pot ---------- */

/**
 * Pull a tool from the cup and drag it across the tasks. The dragged tool is
 * positioned in viewport space, so it can travel from the pot on the right
 * all the way to a row on the left.
 */
function startToolDrag(toolId, event, source) {
  const tool = toolWith(toolId, store.state.settings.toolStyles?.[toolId]);
  const rows = () => document.querySelectorAll('#view .task-row[data-instance]');
  if (!rows().length) return;

  source.classList.add('lifted');

  const ghost = el('div', { class: 'hand-tool', dataset: { tool: toolId } }, [toolSvg(toolId, tool.ink)]);
  document.body.append(ghost);

  const place = (x, y) => {
    ghost.style.left = `${x - GRAB_X}px`;
    ghost.style.top = `${y - GRAB_Y}px`;
  };
  place(event.clientX, event.clientY);

  /** Points collected per row while the nib is inside it. */
  const strokes = new Map();

  function inkFor(row) {
    if (!strokes.has(row)) strokes.set(row, { points: [], path: null });
    const stroke = strokes.get(row);
    if (!stroke.path) {
      stroke.path = svg('path', {
        fill: 'none',
        stroke: tool.ink || getComputedStyle(row).getPropertyValue('--task').trim(),
        'stroke-width': String(tool.width),
        'stroke-opacity': String(tool.opacity),
        'stroke-linecap': tool.id === 'highlighter' ? 'butt' : 'round',
        'stroke-linejoin': 'round',
      });
      row.querySelector('.ink').append(stroke.path);
    }
    return stroke;
  }

  function onMove(moveEvent) {
    place(moveEvent.clientX, moveEvent.clientY);

    const nibX = moveEvent.clientX + NIB_OFFSET_X;
    const nibY = moveEvent.clientY + NIB_OFFSET_Y;

    for (const row of rows()) {
      const rect = row.getBoundingClientRect();
      const inside =
        nibX >= rect.left && nibX <= rect.right &&
        nibY >= rect.top && nibY <= rect.bottom;
      if (!inside) continue;

      if (tool.erases) {
        // The eraser wipes a task's marks off rather than leaving one.
        const layer = row.querySelector('.ink');
        if (layer?.childElementCount) {
          layer.replaceChildren();
          store.clearMarks(row.dataset.instance);
        }
        row.classList.remove('hand-marked');
        continue;
      }

      const stroke = inkFor(row);
      stroke.points.push({ x: nibX - rect.left, y: nibY - rect.top });
      stroke.path.setAttribute('d', pathFromPoints(simplify(stroke.points)));
    }
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    // The tool drops back into the cup.
    ghost.classList.add('returning');
    setTimeout(() => ghost.remove(), 180);
    source.classList.remove('lifted');

    for (const [row, stroke] of strokes) {
      if (stroke.points.length < 2) continue;
      const instanceId = row.dataset.instance;
      const color = getComputedStyle(row).getPropertyValue('--task').trim();

      if (tool.completes) {
        // The freehand line stays on screen while the row clears away.
        row.classList.add('hand-marked');
        completeRow(row, instanceId, tool.ink || color, { instant: true });
      } else {
        // Highlighter and crayon change nothing — they leave colour, and
        // that mark is kept with the task.
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

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
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

/**
 * The part of the page below the heading: the tools, the rows, and whatever's
 * finished. Returned rather than appended, because this is the piece that
 * tears away while the heading stays put.
 */
function todayBody() {
  const date = todayISO();
  const pending = instancesForDate(store.state.instances, date);
  const card = el('div', { class: 'today-body' });

  if (!store.state.tasks.length) return card;

  if (!pending.length) {
    card.append(el('div', { class: 'empty' }, ['All clear for today ✦']));
  } else {
    const surface = el('div', { class: 'pen-surface' });

    // Narrow screens have no room beside the sheet, so the same tools come out
    // as a flat row above the list. Either way it's the pen beside the heading
    // that decides whether they're out at all.
    if (potOpen) {
      surface.append(
        el('div', { class: 'pen-bar' }, [
          pot(true),
          el('span', { class: 'pen-hint', text: 'Drag a tool across a task. Hover one to see what it does.' }),
        ]),
      );
    }

    pending.forEach((instance, index) => {
      const row = taskRow(instance, index);
      if (row) surface.append(row);
    });

    card.append(surface);
  }

  const summary = doneSummary(date);
  if (summary) card.append(summary);
  return card;
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
  // A page with work on it again comes back before anything is drawn.
  refreshTorn();

  const today = todayISO();
  const isToday = mode === 'day' && selected === today;
  const card = el('div', { class: 'card paper' });

  // Day, week and month are three zoom levels of the same page, so they keep
  // the same paper stock and the same accent. Switching zoom shouldn't feel
  // like arriving somewhere else.
  document.body.dataset.view = 'today';

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
        ? el('div', { class: 'row title-row' }, [
            el('h2', { text: 'Today' }),
            store.state.tasks.length ? potToggle() : null,
          ])
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

  // One body for all three zooms, so the sheet keeps its shape when you
  // switch between them instead of collapsing and springing back.
  const zoomBody = el('div', { class: 'cal-body' });
  card.append(zoomBody);

  if (mode === 'month') {
    zoomBody.append(monthGrid(anchor, selected, selectDay), monthLegend(anchor));
  } else if (mode === 'week') {
    zoomBody.append(weekGrid(anchor, selected, selectDay), monthLegend(anchor));
  } else if (isToday) {
    // A torn page shows a clean sheet until something turns up again.
    if (isTornNow(today)) {
      zoomBody.append(freshPage());
    } else {
      const body = todayBody();
      const target = tearable(today);
      zoomBody.append(target ? makeTearZone(body, target, () => rerender()) : body);
    }
  } else {
    zoomBody.append(
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
  const showPot = isToday && potOpen && store.state.tasks.length > 0;
  const board = el('div', { class: `board${showPot ? ' board-with-pot' : ''}` }, [
    el('div', { class: 'board-main' }, [card]),
    showPot ? el('aside', { class: 'board-side' }, [pot()]) : null,
  ]);

  root.append(board);
}
