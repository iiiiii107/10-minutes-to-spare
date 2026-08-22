import { el, modal, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { addDays, formatShort, todayISO } from '../lib/dates.js';

/* Pausing tasks — for a holiday, or a stretch where something genuinely
   doesn't need doing. Paused tasks stop being scheduled and their outstanding
   plans are cleared, so nothing is waiting in a heap when you get back. */

const PRESETS = [
  { label: 'A week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: 'A month', days: 30 },
];

export function pauseDialog() {
  const today = todayISO();
  const chosen = new Set(store.pausedTasks(today).map((t) => t.id));
  let resumeOn = addDays(today, 7);

  const dateInput = el('input', {
    class: 'input',
    type: 'date',
    value: resumeOn,
    min: addDays(today, 1),
    onChange: (event) => {
      resumeOn = event.target.value;
      syncPresets();
    },
  });

  const presetRow = el('div', { class: 'seg seg-wide' });
  function syncPresets() {
    for (const node of presetRow.children) {
      node.setAttribute('aria-selected', String(node.dataset.date === resumeOn));
    }
  }
  for (const preset of PRESETS) {
    const date = addDays(today, preset.days);
    presetRow.append(
      el('button', {
        type: 'button',
        class: 'seg-item',
        text: preset.label,
        dataset: { date },
        'aria-selected': String(date === resumeOn),
        onClick: () => {
          resumeOn = date;
          dateInput.value = date;
          syncPresets();
        },
      }),
    );
  }

  // One row per task, grouped by list, each a checkbox.
  const picker = el('div', { class: 'pause-picker' });
  for (const category of store.state.categories) {
    const tasks = store.tasksInCategory(category.id);
    if (!tasks.length) continue;

    picker.append(
      el('div', { class: 'pause-group', text: `${category.emoji}  ${category.name}` }),
    );

    for (const task of tasks) {
      const box = el('input', {
        type: 'checkbox',
        checked: chosen.has(task.id),
        onChange: (event) => {
          if (event.target.checked) chosen.add(task.id);
          else chosen.delete(task.id);
        },
      });
      picker.append(
        el('label', { class: 'pause-row' }, [
          box,
          el('span', { class: 'pause-dot', style: `background:${task.color}` }),
          el('span', { text: task.name }),
          task.pausedUntil && task.pausedUntil > today
            ? el('span', { class: 'badge moved', text: `until ${formatShort(task.pausedUntil)}` })
            : null,
        ]),
      );
    }
  }

  const body = el('div', {}, [
    el('div', { class: 'field' }, [
      el('label', { text: 'Pause until' }),
      presetRow,
      el('div', { style: 'margin-top:8px' }, [dateInput]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Which tasks' }),
      store.state.tasks.length
        ? picker
        : el('p', { class: 'muted', text: 'No tasks yet.' }),
    ]),
  ]);

  modal({
    title: 'Pause tasks',
    body,
    actions: [
      {
        label: 'Resume all',
        class: 'btn btn-secondary danger',
        onClick: () => {
          const paused = store.pausedTasks(today).map((t) => t.id);
          if (!paused.length) return;
          store.resumeTasks(paused);
          toast('Everything resumed');
        },
      },
      { label: 'Cancel', class: 'btn btn-secondary' },
      {
        label: 'Pause',
        class: 'btn btn-primary',
        onClick: () => {
          const ids = [...chosen];
          // Anything unticked that was paused should start up again.
          const toResume = store
            .pausedTasks(today)
            .filter((t) => !chosen.has(t.id))
            .map((t) => t.id);

          if (toResume.length) store.resumeTasks(toResume);
          if (ids.length) {
            store.pauseTasks(ids, resumeOn);
            toast(`${ids.length} paused until ${formatShort(resumeOn)}`);
          }
        },
      },
    ],
  });
}

/** The banner at the top of Today, shown only when something is on hold. */
export function pausedBanner() {
  const today = todayISO();
  const paused = store.pausedTasks(today);

  const control = el('button', {
    class: 'btn btn-secondary btn-sm',
    text: paused.length ? 'Manage' : 'Pause tasks',
    onClick: pauseDialog,
  });

  if (!paused.length) {
    return el('div', { class: 'pause-bar' }, [
      el('span', { class: 'muted', text: 'Going away? Put tasks on hold.' }),
      control,
    ]);
  }

  // The soonest return is the one worth naming.
  const next = paused.reduce((a, b) => (a.pausedUntil < b.pausedUntil ? a : b));

  return el('div', { class: 'pause-bar paused' }, [
    el('span', {}, [
      el('strong', { text: `${paused.length} task${paused.length === 1 ? '' : 's'} paused` }),
      ` · back ${formatShort(next.pausedUntil)}`,
    ]),
    control,
  ]);
}
