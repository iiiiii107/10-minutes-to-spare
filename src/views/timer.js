import { capturePointer, clear, el, modal, toast } from '../lib/dom.js';
import { store, TASK_COLORS } from '../lib/store.js';
import { instancesForDate } from '../lib/schedule.js';
import { todayISO } from '../lib/dates.js';
import { formatClock, timer } from '../lib/timer.js';

/* Timer, notes, and stickers.

   The countdown itself lives in lib/timer.js so it keeps running when you
   navigate away. Stickers are yours to place: nothing is pinned to the pad
   automatically, and anything you do pin stays put until you remove it. */

const PRESETS = [5, 10, 30];

function stickerDialog(date) {
  const pending = instancesForDate(store.state.instances, date);
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

/** Renders one placed sticker and lets it be dragged around the pad. */
function placedSticker(pad, date, sticker) {
  const node = el('div', {
    class: 'sticker-placed',
    style: `--task:${sticker.color}; left:${sticker.x}px; top:${sticker.y}px`,
    text: sticker.text,
    title: 'Drag to move · double-click to remove',
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

  for (const sticker of store.stickersFor(date)) {
    pad.append(placedSticker(pad, date, sticker));
  }

  const notesCard = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Notes' }),
      el('span', { class: 'sub', text: 'stickers are yours to add' }),
      el('span', { style: 'margin-left:auto' }, [
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: '+ Sticker',
          onClick: () => stickerDialog(date),
        }),
      ]),
    ]),
    pad,
  ]);

  root.append(timerCard, notesCard);
  paint();
}

/** Kept for the router; the countdown itself deliberately keeps running. */
export function teardownTimer(root) {
  root?.dispatchEvent(new CustomEvent('view:teardown'));
}
