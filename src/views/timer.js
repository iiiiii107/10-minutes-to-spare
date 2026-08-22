import { clear, el, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { instancesForDate } from '../lib/schedule.js';
import { todayISO } from '../lib/dates.js';

/* Timer, notes, and today's tasks as stickers you can stick onto the notepad.
   Sticking one on is a statement of intent — it doesn't complete the task or
   start the clock; that stays your call. */

const PRESETS = [5, 10, 30];

let remaining = 10 * 60;
let duration = 10 * 60;
let ticker = null;
let running = false;
let chosen = 10;

function format(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function notify() {
  toast("Time's up ✦");
  try {
    if (store.state.settings.notificationsEnabled && Notification.permission === 'granted') {
      new Notification('10 Minutes to Spare', { body: "Time's up — how did you get on?" });
    }
  } catch {
    /* Notifications are a nicety; never let them break the timer. */
  }
}

/** Places a sticker on the pad and makes it draggable within it. */
function placeSticker(pad, task, x, y) {
  const sticker = el('div', {
    class: 'sticker-placed',
    style: `--task:${task.color}; left:${x}px; top:${y}px`,
    text: task.name,
    title: 'Drag to move · double-click to remove',
  });

  sticker.addEventListener('dblclick', () => sticker.remove());

  sticker.addEventListener('pointerdown', (event) => {
    const box = sticker.getBoundingClientRect();
    const grabX = event.clientX - box.left;
    const grabY = event.clientY - box.top;
    sticker.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      const padBox = pad.getBoundingClientRect();
      const nextX = moveEvent.clientX - padBox.left - grabX;
      const nextY = moveEvent.clientY - padBox.top - grabY;
      sticker.style.left = `${Math.max(0, Math.min(nextX, pad.clientWidth - 40))}px`;
      sticker.style.top = `${Math.max(0, Math.min(nextY, pad.clientHeight - 24))}px`;
    };
    const up = () => {
      sticker.removeEventListener('pointermove', move);
      sticker.removeEventListener('pointerup', up);
    };
    sticker.addEventListener('pointermove', move);
    sticker.addEventListener('pointerup', up);
    event.preventDefault();
  });

  pad.append(sticker);
}

/** Drag a tray sticker onto the pad; tapping it does the same thing. */
function makeDraggable(chip, task, pad) {
  chip.addEventListener('pointerdown', (event) => {
    let moved = false;
    const startX = event.clientX;
    const startY = event.clientY;
    chip.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 6) {
        moved = true;
        chip.classList.add('dragging');
        const padBox = pad.getBoundingClientRect();
        const over =
          moveEvent.clientX >= padBox.left && moveEvent.clientX <= padBox.right &&
          moveEvent.clientY >= padBox.top && moveEvent.clientY <= padBox.bottom;
        pad.classList.toggle('drop-target', over);
      }
    };

    const up = (upEvent) => {
      chip.removeEventListener('pointermove', move);
      chip.removeEventListener('pointerup', up);
      chip.classList.remove('dragging');
      pad.classList.remove('drop-target');

      const padBox = pad.getBoundingClientRect();
      const inside =
        upEvent.clientX >= padBox.left && upEvent.clientX <= padBox.right &&
        upEvent.clientY >= padBox.top && upEvent.clientY <= padBox.bottom;

      if (moved && inside) {
        placeSticker(pad, task, upEvent.clientX - padBox.left - 30, upEvent.clientY - padBox.top - 12);
      } else if (!moved) {
        // Tap-to-add, for touch and for anyone who'd rather not drag.
        placeSticker(pad, task, 16, 16 + pad.querySelectorAll('.sticker-placed').length * 30);
      }
    };

    chip.addEventListener('pointermove', move);
    chip.addEventListener('pointerup', up);
    event.preventDefault();
  });
}

export function renderTimer(root) {
  clear(root);
  const date = todayISO();

  const ring = el('div', { class: 'timer-ring' });
  const readout = el('div', { class: 't', text: format(remaining) });
  const label = el('div', { class: 'l', text: running ? 'remaining' : 'ready' });
  ring.append(el('div', { class: 'timer-face' }, [readout, label]));

  function paint() {
    readout.textContent = format(remaining);
    ring.style.setProperty('--pct', `${((duration - remaining) / duration) * 360}deg`);
  }
  paint();

  function stop() {
    clearInterval(ticker);
    ticker = null;
    running = false;
    label.textContent = 'ready';
    startButton.textContent = 'Start';
  }

  function setDuration(minutes) {
    chosen = minutes;
    duration = minutes * 60;
    remaining = duration;
    stop();
    paint();
  }

  const startButton = el('button', {
    class: 'btn btn-primary',
    text: running ? 'Pause' : 'Start',
    onClick: () => {
      if (running) {
        stop();
        return;
      }
      running = true;
      label.textContent = 'remaining';
      startButton.textContent = 'Pause';
      ticker = setInterval(() => {
        remaining -= 1;
        paint();
        if (remaining <= 0) {
          stop();
          remaining = duration;
          paint();
          notify();
        }
      }, 1000);
    },
  });

  const presetRow = el('div', { class: 'preset-row' });
  for (const minutes of PRESETS) {
    presetRow.append(
      el('button', {
        class: 'preset',
        text: `${minutes}m`,
        'aria-pressed': String(chosen === minutes),
        onClick: () => { setDuration(minutes); renderTimer(root); },
      }),
    );
  }
  presetRow.append(
    el('button', {
      class: 'preset',
      text: 'custom',
      'aria-pressed': String(!PRESETS.includes(chosen)),
      onClick: () => {
        const answer = prompt('How many minutes?', String(chosen));
        const minutes = Number(answer);
        if (Number.isFinite(minutes) && minutes > 0 && minutes <= 240) {
          setDuration(Math.round(minutes));
          renderTimer(root);
        }
      },
    }),
  );

  const timerCard = el('div', { class: 'card paper' }, [
    el('div', { class: 'timer-wrap' }, [
      ring,
      el('div', { class: 'row' }, [
        startButton,
        el('button', {
          class: 'btn btn-secondary',
          text: 'Reset',
          onClick: () => { setDuration(chosen); renderTimer(root); },
        }),
      ]),
      presetRow,
    ]),
  ]);

  // ---- notes + stickers ----
  const pad = el('div', { class: 'notepad' });
  const notes = el('textarea', {
    class: 'textarea',
    placeholder: "What are you going to get done?",
    'aria-label': 'Notes for today',
    onInput: (event) => store.setNote(date, event.target.value),
  });
  notes.value = store.state.notes[date] || '';
  pad.append(notes);

  const notesCard = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Notes' }),
      el('span', { class: 'sub', text: "stick today's tasks on to commit to them" }),
    ]),
    pad,
  ]);

  const pending = instancesForDate(store.state.instances, date);
  if (pending.length) {
    const tray = el('div', { class: 'sticker-tray' });
    for (const instance of pending) {
      const task = store.taskById(instance.taskId);
      if (!task) continue;
      const chip = el('div', {
        class: 'sticker',
        style: `--task:${task.color}`,
        text: task.name,
        title: 'Tap or drag onto the notepad',
      });
      makeDraggable(chip, task, pad);
      tray.append(chip);
    }
    notesCard.append(tray);
  } else {
    notesCard.append(
      el('p', { class: 'muted', style: 'margin-top:12px', text: 'No tasks left today ✦' }),
    );
  }

  root.append(timerCard, notesCard);
}

/** Called by the router when leaving, so the clock doesn't tick on unseen. */
export function teardownTimer() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
    running = false;
  }
}
