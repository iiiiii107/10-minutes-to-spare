import { clear, clear as clearNode, el, modal, toast } from '../lib/dom.js';
import { store, TASK_COLORS } from '../lib/store.js';
import {
  PERIOD_MAX, describeFrequency, frequencyOf, shortFrequency, slotLabel,
} from '../lib/schedule.js';

/* Categories and the tasks inside them. Everything is editable: tap a
   category to rename it, change its emoji or colour, or delete it. */

/** Paper stocks a list can be written on. */
const PATTERNS = [
  { id: 'plain', label: 'Plain' },
  { id: 'ruled', label: 'Ruled' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dotted' },
  { id: 'graph', label: 'Graph' },
];

const EMOJI_CHOICES = [
  '🏠', '🧹', '🧺', '🍳', '🪴', '💻', '📚', '✉️',
  '💪', '🧘', '🚶', '💧', '🐾', '🎨', '🎸', '💰',
  '📞', '🛒', '🧾', '🗂️', '🛏️', '🚿', '🧠', '✨',
];

/** The palette for quick picking, plus a colour wheel for anything else. */
function colorPicker(selected, onPick) {
  const wrap = el('div', { class: 'swatch-picker' });
  const clear = () => {
    for (const node of wrap.children) node.setAttribute('aria-pressed', 'false');
  };

  for (const color of TASK_COLORS) {
    wrap.append(
      el('button', {
        type: 'button',
        class: 'swatch-opt',
        style: `background:${color}`,
        'aria-label': `Colour ${color}`,
        'aria-pressed': String(color === selected),
        onClick: (event) => {
          clear();
          event.currentTarget.setAttribute('aria-pressed', 'true');
          onPick(color);
        },
      }),
    );
  }

  // A custom colour lands here and stays selected while you tune it.
  const custom = el('input', {
    type: 'color',
    class: 'swatch-custom',
    value: selected?.startsWith('#') ? selected : '#7E9A70',
    'aria-label': 'Any other colour',
    title: 'Any other colour',
    onInput: (event) => {
      clear();
      custom.setAttribute('aria-pressed', 'true');
      onPick(event.target.value);
    },
  });
  if (selected?.startsWith('#')) custom.setAttribute('aria-pressed', 'true');
  wrap.append(custom);

  return wrap;
}

/** Common icons for one tap, and a field that takes any emoji at all. */
function emojiPicker(selected, onPick) {
  const grid = el('div', { class: 'emoji-picker' });

  const free = el('input', {
    class: 'input emoji-free',
    value: selected || '',
    maxlength: '4',
    'aria-label': 'Any emoji',
    placeholder: '🙂',
    onInput: (event) => {
      for (const node of grid.children) node.setAttribute('aria-pressed', 'false');
      onPick(event.target.value.trim());
    },
  });

  for (const emoji of EMOJI_CHOICES) {
    grid.append(
      el('button', {
        type: 'button',
        class: 'emoji-opt',
        text: emoji,
        'aria-label': emoji,
        'aria-pressed': String(emoji === selected),
        onClick: (event) => {
          for (const node of grid.children) node.setAttribute('aria-pressed', 'false');
          event.currentTarget.setAttribute('aria-pressed', 'true');
          free.value = emoji;
          onPick(emoji);
        },
      }),
    );
  }

  return el('div', { class: 'emoji-field' }, [
    grid,
    el('div', { class: 'emoji-any' }, [
      el('span', { class: 'muted', text: 'or paste any emoji:' }),
      free,
    ]),
  ]);
}

function categoryDialog(existing) {
  const draft = {
    name: existing?.name || '',
    emoji: existing?.emoji || '📁',
    color: existing?.color || TASK_COLORS[0],
    pattern: existing?.pattern || 'plain',
  };

  const nameInput = el('input', {
    class: 'input',
    value: draft.name,
    maxlength: '40',
    placeholder: 'e.g. Kitchen',
  });

  const body = el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: 'Name' }), nameInput]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Icon' }),
      emojiPicker(draft.emoji, (v) => { draft.emoji = v; }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Colour' }),
      colorPicker(draft.color, (v) => { draft.color = v; }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Paper' }),
      el(
        'div',
        { class: 'seg seg-wrap' },
        PATTERNS.map((pattern) =>
          el('button', {
            type: 'button',
            class: 'seg-item',
            text: pattern.label,
            'aria-selected': String(pattern.id === draft.pattern),
            onClick: (event) => {
              draft.pattern = pattern.id;
              for (const node of event.currentTarget.parentNode.children) {
                node.setAttribute('aria-selected', 'false');
              }
              event.currentTarget.setAttribute('aria-selected', 'true');
            },
          }),
        ),
      ),
    ]),
  ]);

  const actions = [];
  if (existing) {
    actions.push({
      label: 'Delete',
      class: 'btn btn-secondary danger',
      onClick: () => {
        const count = store.tasksInCategory(existing.id).length;
        const message = count
          ? `Delete "${existing.name}" and its ${count} task${count === 1 ? '' : 's'}?`
          : `Delete "${existing.name}"?`;
        if (confirm(message)) {
          store.deleteCategory(existing.id);
          toast('List deleted');
        }
      },
    });
  }
  actions.push({ label: 'Cancel', class: 'btn btn-secondary' });
  actions.push({
    label: existing ? 'Save' : 'Add list',
    class: 'btn btn-primary',
    onClick: () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return false;
      }
      if (existing) store.updateCategory(existing.id, { ...draft, name });
      else store.addCategory({ ...draft, name });
    },
  });

  modal({ title: existing ? 'Edit list' : 'New list', body, actions });
}

/**
 * @param {string|null} categoryId  fixed category, or null to let the user pick
 * @param {object} [existing]       task being edited
 * @param {boolean} [scheduleToday] also drop the new task onto today's list
 */
export function taskDialog(categoryId, existing, scheduleToday = false) {
  const category = store.categoryById(categoryId);
  const draft = {
    categoryId: categoryId || store.state.categories[0]?.id,
    name: existing?.name || '',
    ...(existing ? frequencyOf(existing) : { count: 2, period: 'week' }),
    color: existing?.color || category?.color || TASK_COLORS[0],
    startTime: existing?.startTime || '',
    duration: existing?.duration || store.state.settings.minutesPerTask || 10,
  };

  const nameInput = el('input', {
    class: 'input',
    value: draft.name,
    maxlength: '60',
    placeholder: 'e.g. Water the plants',
  });

  // Only offered when the caller didn't pin the category down.
  const categorySelect = categoryId
    ? null
    : el(
        'select',
        {
          class: 'select',
          onChange: (event) => { draft.categoryId = event.target.value; },
        },
        store.state.categories.map((c) =>
          el('option', { value: c.id, text: `${c.emoji}  ${c.name}` }),
        ),
      );

  // Period first, then how many times within it. Counts are tappable rather
  // than a slider: the whole range is visible and every value is one tap.
  const freqValue = el('span', {
    class: 'muted',
    style: 'margin-top:8px; display:block',
  });
  const countRow = el('div', { class: 'seg seg-wrap' });

  function paintCounts() {
    clearNode(countRow);
    const max = PERIOD_MAX[draft.period];
    // Common counts as one tap each, then "xx" for anything else.
    const choices =
      draft.period === 'week'
        ? [1, 2, 3, 4, 5, 6, 7]
        : draft.period === 'month'
          ? [1, 2, 3, 4, 6]
          : [1, 2, 3, 4, 6];

    if (draft.count > max) draft.count = max;

    for (const n of choices) {
      countRow.append(
        el('button', {
          type: 'button',
          class: 'seg-item',
          text: String(n),
          'aria-label': `${n} times a ${draft.period}`,
          'aria-selected': String(n === draft.count),
          onClick: () => {
            draft.count = n;
            paintCounts();
          },
        }),
      );
    }

    // "xx" turns into a number field so any count is reachable, not just the
    // handful that fit as buttons.
    const isCustom = !choices.includes(draft.count);
    const custom = el('button', {
      type: 'button',
      class: 'seg-item seg-custom',
      text: isCustom ? String(draft.count) : 'xx',
      'aria-label': 'Some other number of times',
      'aria-selected': String(isCustom),
      onClick: () => {
        const field = el('input', {
          class: 'seg-item seg-input',
          type: 'number',
          min: '1',
          max: String(max),
          value: String(draft.count),
          'aria-label': `How many times a ${draft.period}`,
        });
        const commit = () => {
          const n = Math.round(Number(field.value));
          if (Number.isFinite(n) && n >= 1) draft.count = Math.min(n, max);
          paintCounts();
        };
        field.addEventListener('blur', commit);
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
        });
        custom.replaceWith(field);
        field.focus();
        field.select();
      },
    });
    countRow.append(custom);

    freqValue.textContent = describeFrequency(draft.count, draft.period);
  }

  const periodRow = el(
    'div',
    { class: 'seg seg-wide' },
    ['week', 'month', 'year'].map((period) =>
      el('button', {
        type: 'button',
        class: 'seg-item',
        text: `a ${period}`,
        'aria-selected': String(period === draft.period),
        onClick: (event) => {
          draft.period = period;
          for (const node of event.currentTarget.parentNode.children) {
            node.setAttribute('aria-selected', 'false');
          }
          event.currentTarget.setAttribute('aria-selected', 'true');
          paintCounts();
        },
      }),
    ),
  );

  paintCounts();

  /* When you mean to do it. This is for the calendar only — the task belongs
     to the whole day and can be ticked off at any hour, so the field says so
     rather than leaving you to wonder. */
  const timeInput = el('input', {
    class: 'input time-input',
    type: 'time',
    value: draft.startTime,
    'aria-label': 'Time of day',
    onInput: (event) => {
      draft.startTime = event.target.value;
      paintSlot();
    },
  });

  const durationReadout = el('span', { class: 'stepper-value' });
  const durationRow = el('div', { class: 'stepper' }, [
    el('button', {
      class: 'btn btn-secondary btn-sm', type: 'button', text: '−', 'aria-label': 'Shorter',
      onClick: () => { draft.duration = Math.max(5, draft.duration - 5); paintSlot(); },
    }),
    durationReadout,
    el('button', {
      class: 'btn btn-secondary btn-sm', type: 'button', text: '+', 'aria-label': 'Longer',
      onClick: () => { draft.duration = Math.min(240, draft.duration + 5); paintSlot(); },
    }),
  ]);

  const slotNote = el('div', { class: 'muted' });
  const clearSlot = el('button', {
    class: 'btn btn-secondary btn-sm', type: 'button', text: 'No set time',
    onClick: () => { draft.startTime = ''; timeInput.value = ''; paintSlot(); },
  });

  function paintSlot() {
    const label = slotLabel({ startTime: draft.startTime, duration: draft.duration }, {});
    durationReadout.textContent = `${draft.duration} min`;
    durationRow.hidden = !label;
    clearSlot.hidden = !label;
    slotNote.textContent = label
      ? `${label} in your calendar. You can still tick it off any time that day.`
      : 'No set time — it just belongs to the day.';
  }
  paintSlot();

  const body = el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: 'Task' }), nameInput]),
    categorySelect
      ? el('div', { class: 'field' }, [
          el('label', { text: 'List' }),
          categorySelect,
        ])
      : null,
    el('div', { class: 'field' }, [
      el('label', { text: 'How often' }),
      periodRow,
      el('div', { style: 'margin-top:8px' }, [countRow]),
      freqValue,
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'When' }),
      el('div', { class: 'slot-row' }, [timeInput, durationRow, clearSlot]),
      slotNote,
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Colour' }),
      colorPicker(draft.color, (v) => { draft.color = v; }),
    ]),
  ]);

  const actions = [];
  if (existing) {
    actions.push({
      label: 'Delete',
      class: 'btn btn-secondary danger',
      onClick: () => {
        if (confirm(`Delete "${existing.name}"?`)) {
          store.deleteTask(existing.id);
          toast('Task deleted');
        }
      },
    });
  }
  actions.push({ label: 'Cancel', class: 'btn btn-secondary' });
  actions.push({
    label: existing ? 'Save' : 'Add task',
    class: 'btn btn-primary',
    onClick: () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return false;
      }
      if (existing) {
        store.updateTask(existing.id, { ...draft, name });
      } else {
        store.addTask({ ...draft, name });
        if (scheduleToday) {
          const added = store.state.tasks[store.state.tasks.length - 1];
          store.scheduleForToday(added.id);
        }
      }
    },
  });

  modal({ title: existing ? 'Edit task' : 'New task', body, actions });
}

function categoryCard(category) {
  const tasks = store.tasksInCategory(category.id);
  // Each card is tinted with its own colour, like a pad of coloured notes.
  const card = el('div', {
    class: `card paper note note-${category.pattern || 'plain'}`,
    style: `--note-tint: ${category.color}`,
  });

  card.append(
    el('div', { class: 'cat-head' }, [
      el('span', {
        class: 'cat-mark',
        style: `background:color-mix(in srgb, ${category.color} 30%, var(--paper))`,
        text: category.emoji,
      }),
      el('span', { class: 'cat-title', text: category.name }),
      el('button', {
        class: 'icon-btn',
        'aria-label': `Move ${category.name} earlier`,
        title: 'Move earlier',
        text: '↑',
        onClick: () => store.moveCategory(category.id, -1),
      }),
      el('button', {
        class: 'icon-btn',
        'aria-label': `Move ${category.name} later`,
        title: 'Move later',
        text: '↓',
        onClick: () => store.moveCategory(category.id, 1),
      }),
      el('button', {
        class: 'icon-btn',
        'aria-label': `Edit ${category.name}`,
        text: '✎',
        onClick: () => categoryDialog(category),
      }),
    ]),
  );

  if (!tasks.length) {
    card.append(el('p', { class: 'muted', text: 'No tasks in here yet.' }));
  } else {
    for (const task of tasks) {
      card.append(
        el('div', { class: 'task-row', style: `--task:${task.color}` }, [
          // The slot sits under the name rather than out in the meta row:
          // a list card is narrow, and a badge added to that row had nowhere
          // to go but on top of the task it belonged to.
          el('span', {
            class: 'task-label',
            style: 'cursor:pointer',
            onClick: () => taskDialog(category.id, task),
          }, [
            el('span', { class: 'task-name', text: task.name }),
            slotLabel(task, store.state.settings)
              ? el('span', {
                  class: 'task-when',
                  text: slotLabel(task, store.state.settings),
                })
              : null,
          ]),
          el('div', { class: 'task-meta' }, [
            task.pausedUntil && task.pausedUntil > new Date().toISOString().slice(0, 10)
              ? el('span', { class: 'badge moved', text: 'paused' })
              : null,
            el('span', { class: 'freq-badge', text: shortFrequency(task) }),
            el('button', {
              class: 'icon-btn',
              'aria-label': `Move ${task.name} up`,
              title: 'Move up',
              text: '↑',
              onClick: () => store.moveTask(task.id, -1),
            }),
            el('button', {
              class: 'icon-btn',
              'aria-label': `Move ${task.name} down`,
              title: 'Move down',
              text: '↓',
              onClick: () => store.moveTask(task.id, 1),
            }),
            el('button', {
              class: 'icon-btn',
              'aria-label': `Edit ${task.name}`,
              text: '✎',
              onClick: () => taskDialog(category.id, task),
            }),
          ]),
        ]),
      );
    }
  }

  card.append(
    el('div', { style: 'margin-top:14px' }, [
      el('button', {
        class: 'btn btn-secondary btn-sm',
        text: '+ Add task',
        onClick: () => taskDialog(category.id),
      }),
    ]),
  );

  return card;
}

export function renderCategories(root) {
  clear(root);

  root.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Lists' }),
      el('span', { class: 'sub', text: 'group your tasks however makes sense' }),
      el('span', { style: 'margin-left:auto' }, [
        el('button', {
          class: 'btn btn-primary btn-sm',
          text: '+ New list',
          onClick: () => categoryDialog(),
        }),
      ]),
    ]),
  );

  // No lists means nothing below the heading; the button is the only prompt.
  if (!store.state.categories.length) return;

  const grid = el('div', { class: 'grid-2' });
  for (const category of store.state.categories) {
    grid.append(categoryCard(category));
  }
  root.append(grid);
}
