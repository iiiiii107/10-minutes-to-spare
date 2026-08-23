import { capturePointer, clear, el, modal, svg, toast } from '../lib/dom.js';
import { store, TASK_COLORS } from '../lib/store.js';
import { instancesForDate } from '../lib/schedule.js';
import { todayISO } from '../lib/dates.js';
import { formatClock, timer } from '../lib/timer.js';
import { penPot, toolSvg } from './pot.js';
import { pathFromPoints, simplify, toolWith } from '../lib/tools.js';
import { toolStyleDialog } from './tool-style.js';

/* Timer, notes, and stickers.

   The countdown itself lives in lib/timer.js so it keeps running when you
   navigate away. Stickers are yours to place: nothing is pinned to the pad
   automatically, and anything you do pin stays put until you remove it. */

const PRESETS = [5, 10, 30];

let mountRoot = null;

function stickerDialog(date) {
  const pending = instancesForDate(store.state.instances, date, store.state.tasks);
  const customInput = el('input', {
    class: 'input',
    maxlength: '40',
    placeholder: 'Anything you like',
  });

  let color = TASK_COLORS[0];
  const colors = el('div', { class: 'swatch-picker' });
  for (const option of TASK_COLORS) {
    colors.append(
      el('button', {
        type: 'button',
        class: 'swatch-opt',
        style: `background:${option}`,
        'aria-label': `Colour ${option}`,
        'aria-pressed': String(option === color),
        onClick: (event) => {
          for (const node of colors.children) node.setAttribute('aria-pressed', 'false');
          event.currentTarget.setAttribute('aria-pressed', 'true');
          color = option;
        },
      }),
    );
  }

  const body = el('div', {});

  if (pending.length) {
    const fromTasks = el('div', { class: 'stack', style: 'gap:8px' });
    for (const instance of pending) {
      const task = store.taskById(instance.taskId);
      if (!task) continue;
      fromTasks.append(
        el('button', {
          class: 'sticker-choice',
          style: `--task:${task.color}`,
          text: task.name,
          onClick: () => {
            store.addSticker(date, { text: task.name, color: task.color });
            document.querySelector('.modal-backdrop')?.remove();
          },
        }),
      );
    }
    body.append(
      el('div', { class: 'field' }, [
        el('label', { text: "From today's tasks" }),
        fromTasks,
      ]),
    );
  }

  body.append(
    el('div', { class: 'field' }, [
      el('label', { text: 'Or write your own' }),
      customInput,
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'Colour' }), colors]),
  );

  modal({
    title: 'Add a sticker',
    body,
    actions: [
      { label: 'Cancel', class: 'btn btn-secondary' },
      {
        label: 'Add',
        class: 'btn btn-primary',
        onClick: () => {
          const text = customInput.value.trim();
          if (!text) {
            customInput.focus();
            return false;
          }
          store.addSticker(date, { text, color });
        },
      },
    ],
  });
}

/* ---------- the pot, over the notepad ----------

   The same four tools as the task list, doing the equivalent thing here: the
   pad is the canvas, so pen, highlighter and crayon write on it, and the
   eraser takes off whatever it is dragged over — marks and stickers alike.

   Nothing is written to the store until the pointer comes up. A save
   re-renders the view, which would pull the pad out from under a drag in
   progress, so the whole stroke is collected first and committed once. */

/* Where the nib sits relative to the pointer. The tool is drawn nib-up and
   turned 150° when grabbed (see .hand-tool), which swings the tip down and to
   the right of where you're holding it. */
const NIB_OFFSET_Y = 26;
const NIB_OFFSET_X = 14;
const GRAB_X = 11;
const GRAB_Y = 20;

let padOpen = false;

/* A phone has no space bar, so picking a tool up is a mode there instead: tap
   one and it stays in your hand until you tap it again. */
let armed = null;

function startPadToolDrag(date, toolId, event, source) {
  const tool = toolWith(toolId, store.state.settings.toolStyles?.[toolId]);
  const pad = document.querySelector('#view .notepad');
  const layer = pad?.querySelector('.pad-ink');
  if (!pad || !layer) return;

  source.classList.add('lifted');

  const ghost = el('div', { class: 'hand-tool', dataset: { tool: toolId } }, [
    toolSvg(toolId, tool.ink),
  ]);
  document.body.append(ghost);

  const place = (x, y) => {
    ghost.style.left = `${x - GRAB_X}px`;
    ghost.style.top = `${y - GRAB_Y}px`;
  };
  place(event.clientX, event.clientY);

  /* Holding space lifts the nib — the tool keeps following the pointer but
     stops writing, so a single drag can leave several separate marks. */
  const strokes = [];
  let points = [];
  let path = null;
  let lifted = false;

  /* A press that never travels is a tap, and a tap picks the tool up. */
  const from = { x: event.clientX, y: event.clientY };
  let travelled = false;

  function closeStroke() {
    if (points.length >= 2 && path) strokes.push(path);
    points = [];
    path = null;
  }

  function liftNib() {
    if (lifted) return;
    lifted = true;
    ghost.classList.add('lifted-nib');
    closeStroke();
  }

  function lowerNib() {
    lifted = false;
    ghost.classList.remove('lifted-nib');
  }

  function onKeyDown(keyEvent) {
    if (keyEvent.code !== 'Space' && keyEvent.key !== ' ') return;
    keyEvent.preventDefault();
    liftNib();
  }

  function onKeyUp(keyEvent) {
    if (keyEvent.code !== 'Space' && keyEvent.key !== ' ') return;
    keyEvent.preventDefault();
    lowerNib();
  }

  /** Stickers rubbed out this pass, committed on release. */
  const erased = new Set();
  let wipedMarks = false;

  function onMove(moveEvent) {
    place(moveEvent.clientX, moveEvent.clientY);
    if (Math.hypot(moveEvent.clientX - from.x, moveEvent.clientY - from.y) > 6) {
      travelled = true;
    }

    // Nib up: still in hand, still following, just not writing.
    if (lifted) return;

    const nibX = moveEvent.clientX + NIB_OFFSET_X;
    const nibY = moveEvent.clientY + NIB_OFFSET_Y;
    const box = pad.getBoundingClientRect();

    if (tool.erases) {
      for (const node of pad.querySelectorAll('.sticker-placed[data-sticker]')) {
        const rect = node.getBoundingClientRect();
        const over =
          nibX >= rect.left && nibX <= rect.right &&
          nibY >= rect.top && nibY <= rect.bottom;
        if (!over) continue;
        erased.add(node.dataset.sticker);
        node.classList.add('rubbed-out');
        node.removeAttribute('data-sticker');
        setTimeout(() => node.remove(), 200);
      }

      const inside =
        nibX >= box.left && nibX <= box.right && nibY >= box.top && nibY <= box.bottom;
      if (inside && layer.childElementCount) {
        layer.replaceChildren();
        wipedMarks = true;
      }
      return;
    }

    const inside =
      nibX >= box.left && nibX <= box.right && nibY >= box.top && nibY <= box.bottom;
    if (!inside) return;

    if (!path) {
      path = svg('path', {
        fill: 'none',
        stroke: tool.ink || 'var(--ink)',
        'stroke-width': String(tool.width),
        'stroke-opacity': String(tool.opacity),
        'stroke-linecap': tool.id === 'highlighter' ? 'butt' : 'round',
        'stroke-linejoin': 'round',
      });
      layer.append(path);
    }
    points.push({ x: nibX - box.left, y: nibY - box.top });
    path.setAttribute('d', pathFromPoints(simplify(points)));
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', liftNib);

    ghost.classList.add('returning');
    setTimeout(() => ghost.remove(), 180);
    source.classList.remove('lifted');

    // Never went anywhere: you tapped it, so it goes in your hand.
    if (!travelled) {
      armed = armed === toolId ? null : toolId;
      if (mountRoot) renderTimer(mountRoot);
      return;
    }

    if (tool.erases) {
      if (erased.size || wipedMarks) {
        store.eraseFromPad(date, { stickerIds: [...erased], clearMarks: wipedMarks });
      }
      return;
    }

    closeStroke();
    if (!strokes.length) return;

    store.addPadMarks(date, strokes.map((stroke) => ({
      d: stroke.getAttribute('d'),
      ink: tool.ink || 'var(--ink)',
      width: tool.width,
      opacity: tool.opacity,
      cap: tool.id === 'highlighter' ? 'butt' : 'round',
    })));
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', liftNib);
}


/**
 * With a tool armed, a finger on the pad draws on it — no ghost, and the nib
 * under the finger rather than offset, because there is no drawn tool in your
 * hand to write from the tip of.
 */
function armedPadDraw(pad, date) {
  pad.classList.add('armed');
  const layer = pad.querySelector('.pad-ink');
  if (!layer) return;

  pad.addEventListener('pointerdown', (event) => {
    if (!armed) return;
    if (event.target.closest('.pot-tool')) return;
    const tool = toolWith(armed, store.state.settings.toolStyles?.[armed]);

    event.preventDefault();
    capturePointer(pad, event.pointerId);

    const points = [];
    let path = null;
    const erased = new Set();
    let wiped = false;

    function draw(pointer) {
      const box = pad.getBoundingClientRect();

      if (tool.erases) {
        for (const node of pad.querySelectorAll('.sticker-placed[data-sticker]')) {
          const rect = node.getBoundingClientRect();
          const over =
            pointer.clientX >= rect.left && pointer.clientX <= rect.right &&
            pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
          if (!over) continue;
          erased.add(node.dataset.sticker);
          node.classList.add('rubbed-out');
          node.removeAttribute('data-sticker');
          setTimeout(() => node.remove(), 200);
        }
        if (layer.childElementCount) {
          layer.replaceChildren();
          wiped = true;
        }
        return;
      }

      if (!path) {
        path = svg('path', {
          fill: 'none',
          stroke: tool.ink || 'var(--ink)',
          'stroke-width': String(tool.width),
          'stroke-opacity': String(tool.opacity),
          'stroke-linecap': tool.id === 'highlighter' ? 'butt' : 'round',
          'stroke-linejoin': 'round',
        });
        layer.append(path);
      }
      points.push({ x: pointer.clientX - box.left, y: pointer.clientY - box.top });
      path.setAttribute('d', pathFromPoints(simplify(points)));
    }

    draw(event);

    function onMove(moveEvent) {
      moveEvent.preventDefault();
      draw(moveEvent);
    }

    function onUp() {
      pad.removeEventListener('pointermove', onMove);
      pad.removeEventListener('pointerup', onUp);
      pad.removeEventListener('pointercancel', onUp);

      if (tool.erases) {
        if (erased.size || wiped) {
          store.eraseFromPad(date, { stickerIds: [...erased], clearMarks: wiped });
        }
        return;
      }
      if (points.length < 2 || !path) {
        path?.remove();
        return;
      }
      store.addPadMarks(date, [{
        d: path.getAttribute('d'),
        ink: tool.ink || 'var(--ink)',
        width: tool.width,
        opacity: tool.opacity,
        cap: tool.id === 'highlighter' ? 'butt' : 'round',
      }]);
    }

    pad.addEventListener('pointermove', onMove);
    pad.addEventListener('pointerup', onUp);
    pad.addEventListener('pointercancel', onUp);
  });
}

/** The pen that fetches the pot out over the notepad. */
function padPotToggle() {
  return el('button', {
    class: 'pot-toggle',
    'aria-pressed': String(padOpen),
    'aria-label': padOpen ? 'Put the tools away' : 'Get the tools out',
    title: padOpen ? 'Put the tools away' : 'Get the tools out',
    onClick: () => {
      padOpen = !padOpen;
      if (mountRoot) renderTimer(mountRoot);
    },
  }, [
    svg('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
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

/** Renders one placed sticker and lets it be dragged around the pad. */
function placedSticker(pad, date, sticker) {
  const node = el('div', {
    class: 'sticker-placed',
    style: `--task:${sticker.color}; left:${sticker.x}px; top:${sticker.y}px`,
    text: sticker.text,
    title: 'Drag to move · double-click to remove · or rub out with the eraser',
    dataset: { sticker: sticker.id },
  });

  node.addEventListener('dblclick', () => store.removeSticker(date, sticker.id));

  node.addEventListener('pointerdown', (event) => {
    const box = node.getBoundingClientRect();
    const grabX = event.clientX - box.left;
    const grabY = event.clientY - box.top;
    capturePointer(node, event.pointerId);
    let x = sticker.x;
    let y = sticker.y;

    const move = (moveEvent) => {
      const padBox = pad.getBoundingClientRect();
      x = Math.max(0, Math.min(moveEvent.clientX - padBox.left - grabX, pad.clientWidth - 50));
      y = Math.max(0, Math.min(moveEvent.clientY - padBox.top - grabY, pad.clientHeight - 26));
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    };
    const up = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      store.moveSticker(date, sticker.id, x, y);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    event.preventDefault();
  });

  return node;
}

export function renderTimer(root) {
  mountRoot = root;
  clear(root);
  const date = todayISO();

  // ---- countdown ----
  const readout = el('div', { class: 't' });
  const label = el('div', { class: 'l' });
  const ring = el('div', { class: 'timer-ring' }, [
    el('div', { class: 'timer-face' }, [readout, label]),
  ]);

  const startButton = el('button', { class: 'btn btn-primary' });

  function paint() {
    readout.textContent = formatClock(timer.remainingSeconds);
    label.textContent = timer.running ? 'remaining' : 'ready';
    startButton.textContent = timer.running ? 'Pause' : 'Start';
    ring.style.setProperty('--pct', `${timer.progress * 360}deg`);
    for (const node of presetRow.children) {
      node.setAttribute('aria-pressed', String(Number(node.dataset.minutes) === timer.minutes));
    }
  }

  startButton.addEventListener('click', () => {
    if (timer.running) timer.pause();
    else timer.start();
  });

  const presetRow = el('div', { class: 'preset-row' });
  for (const minutes of PRESETS) {
    presetRow.append(
      el('button', {
        class: 'preset',
        text: `${minutes}m`,
        dataset: { minutes: String(minutes) },
        onClick: () => timer.setMinutes(minutes),
      }),
    );
  }
  presetRow.append(
    el('button', {
      class: 'preset',
      text: 'custom',
      dataset: { minutes: '0' },
      onClick: () => {
        const answer = prompt('How many minutes?', String(timer.minutes));
        const minutes = Number(answer);
        if (Number.isFinite(minutes) && minutes > 0 && minutes <= 240) {
          timer.setMinutes(Math.round(minutes));
        }
      },
    }),
  );

  // The view follows the timer rather than owning it, so it stays right after
  // navigating away and back.
  const onTimerChange = () => paint();
  timer.addEventListener('change', onTimerChange);
  root.addEventListener('view:teardown', () => {
    timer.removeEventListener('change', onTimerChange);
  });

  const timerCard = el('div', { class: 'card paper' }, [
    el('div', { class: 'timer-wrap' }, [
      ring,
      el('div', { class: 'row' }, [
        startButton,
        el('button', { class: 'btn btn-secondary', text: 'Reset', onClick: () => timer.reset() }),
      ]),
      presetRow,
      el('p', { class: 'muted', text: 'Keeps running if you move around the app.' }),
    ]),
  ]);

  // ---- notes + stickers ----
  const pad = el('div', { class: 'notepad' });
  const notes = el('textarea', {
    class: 'textarea',
    placeholder: 'What are you going to get done?',
    'aria-label': 'Notes for today',
    onInput: (event) => store.setNote(date, event.target.value),
  });
  notes.value = store.state.notes[date] || '';
  pad.append(notes);

  // Everything drawn on the pad, in the pad's own pixel space, under the
  // stickers so they stay grabbable.
  const padInk = svg('svg', { class: 'pad-ink', 'aria-hidden': 'true' });
  for (const mark of store.padMarks(date)) {
    padInk.append(svg('path', {
      d: mark.d,
      fill: 'none',
      stroke: mark.ink,
      'stroke-width': String(mark.width),
      'stroke-opacity': String(mark.opacity),
      'stroke-linecap': mark.cap || 'round',
      'stroke-linejoin': 'round',
    }));
  }
  pad.append(padInk);

  for (const sticker of store.stickersFor(date)) {
    pad.append(placedSticker(pad, date, sticker));
  }

  // With a tool in hand, a finger on the pad draws on it.
  if (armed && padOpen) armedPadDraw(pad, date);

  const notesCard = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Notes' }),
      padPotToggle(),
      el('span', { class: 'sub', text: 'stickers are yours to add' }),
      el('span', { style: 'margin-left:auto' }, [
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: '+ Sticker',
          onClick: () => stickerDialog(date),
        }),
      ]),
    ]),
    padOpen
      ? el('div', { class: 'pen-bar pad-pen-bar' }, [
          penPot({
            onDragStart: (id, event, node) => startPadToolDrag(date, id, event, node),
            onAdjust: toolStyleDialog,
            styles: store.state.settings.toolStyles,
            armed,
            compact: true,
          }),
          el('span', {
            class: `pen-hint${armed ? ' holding' : ''}`,
            text: armed
              ? 'Draw on the pad. Tap the tool again to put it down.'
              : 'Tap a tool to pick it up, or drag it out. The eraser rubs out marks and stickers.',
          }),
        ])
      : null,
    pad,
  ]);

  root.append(timerCard, notesCard);
  paint();
}

/** Kept for the router; the countdown itself deliberately keeps running. */
export function teardownTimer(root) {
  root?.dispatchEvent(new CustomEvent('view:teardown'));
}
