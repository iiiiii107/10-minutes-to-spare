import { clear, el, modal, toast } from '../lib/dom.js';
import { store, TASK_COLORS } from '../lib/store.js';
import { describeFrequency } from '../lib/schedule.js';

/* Categories and the tasks inside them. Everything is editable: tap a
   category to rename it, change its emoji or colour, or delete it. */

const EMOJI_CHOICES = [
  '🏠', '🧹', '🧺', '🍳', '🪴', '💻', '📚', '✉️',
  '💪', '🧘', '🚶', '💧', '🐾', '🎨', '🎸', '💰',
  '📞', '🛒', '🧾', '🗂️', '🛏️', '🚿', '🧠', '✨',
];

function colorPicker(selected, onPick) {
  const wrap = el('div', { class: 'swatch-picker' });
  for (const color of TASK_COLORS) {
    wrap.append(
      el('button', {
        type: 'button',
        class: 'swatch-opt',
        style: `background:${color}`,
        'aria-label': `Colour ${color}`,
        'aria-pressed': String(color === selected),
        onClick: (event) => {
          for (const node of wrap.children) node.setAttribute('aria-pressed', 'false');
          event.currentTarget.setAttribute('aria-pressed', 'true');
          onPick(color);
        },
      }),
    );
  }
  return wrap;
}

function emojiPicker(selected, onPick) {
  const wrap = el('div', { class: 'emoji-picker' });
  for (const emoji of EMOJI_CHOICES) {
    wrap.append(
      el('button', {
        type: 'button',
        class: 'emoji-opt',
        text: emoji,
        'aria-label': emoji,
        'aria-pressed': String(emoji === selected),
        onClick: (event) => {
          for (const node of wrap.children) node.setAttribute('aria-pressed', 'false');
          event.currentTarget.setAttribute('aria-pressed', 'true');
          onPick(emoji);
        },
      }),
    );
  }
  return wrap;
}

function categoryDialog(existing) {
  const draft = {
    name: existing?.name || '',
    emoji: existing?.emoji || '📁',
    color: existing?.color || TASK_COLORS[0],
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
    timesPerWeek: existing?.timesPerWeek ?? 2,
    color: existing?.color || category?.color || TASK_COLORS[0],
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

  // A row of seven tappable counts beats a slider here: the whole range is
  // visible, every value is one tap, and it works the same on a touchscreen.
  const freqValue = el('span', {
    class: 'muted',
    style: 'margin-top:6px; display:block',
    text: describeFrequency(draft.timesPerWeek),
  });
  const freqInput = el('div', { class: 'seg seg-wide' });
  for (let n = 1; n <= 7; n += 1) {
    freqInput.append(
      el('button', {
        type: 'button',
        class: 'seg-item',
        text: String(n),
        'aria-label': `${n} times a week`,
        'aria-selected': String(n === draft.timesPerWeek),
        onClick: () => {
          draft.timesPerWeek = n;
          for (const node of freqInput.children) {
            node.setAttribute('aria-selected', String(Number(node.textContent) === n));
          }
          freqValue.textContent = describeFrequency(n);
        },
      }),
    );
  }

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
      freqInput,
      freqValue,
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
    class: 'card paper note',
    style: `background: color-mix(in srgb, ${category.color} 16%, var(--paper))`,
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
          el('span', {
            class: 'task-label',
            style: 'cursor:pointer',
            text: task.name,
            onClick: () => taskDialog(category.id, task),
          }),
          el('div', { class: 'task-meta' }, [
            task.pausedUntil && task.pausedUntil > new Date().toISOString().slice(0, 10)
              ? el('span', { class: 'badge moved', text: 'paused' })
              : null,
            el('span', { class: 'freq-badge', text: `${task.timesPerWeek}×/wk` }),
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
