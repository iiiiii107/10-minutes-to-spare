import { clear, el } from '../lib/dom.js';
import { store } from '../lib/store.js';

/* The wheel picks uniformly from your tasks, ignoring frequency, schedule and
   history. That's the point — it's for when you're willing but not choosy.

   You can narrow it to particular lists, which is the one thing about the
   draw that is yours to decide: being willing to do *something* isn't the
   same as being willing to do anything, and an evening on the sofa is not the
   evening to be offered the filing. Pick none and every list is in.

   Only eight slices fit legibly, so with a longer list the winner is drawn
   from all the eligible tasks first and the face is rebuilt around it. Every
   one stays reachable; the wheel is the animation, not the lottery. */

const MAX_SLICES = 8;
let rotation = 0;
let spinning = false;

/**
 * Which lists the draw is limited to. Lists that have since been deleted are
 * dropped here rather than left to filter everything out.
 */
function chosenLists() {
  const live = new Set(store.state.categories.map((c) => c.id));
  return (store.state.settings.wheelLists || []).filter((id) => live.has(id));
}

/** The tasks eligible for a spin. No lists chosen means all of them. */
function eligibleTasks() {
  const chosen = chosenLists();
  const active = store.state.tasks.filter((t) => t.active !== false);
  return chosen.length ? active.filter((t) => chosen.includes(t.categoryId)) : active;
}

/** Chips for narrowing the draw. Choosing one re-renders the view. */
function listPicker() {
  const chosen = chosenLists();
  const row = el('div', {
    class: 'wheel-lists', role: 'group', 'aria-label': 'Which lists to draw from',
  });

  row.append(
    el('button', {
      class: 'list-chip',
      type: 'button',
      text: 'All lists',
      'aria-pressed': String(chosen.length === 0),
      onClick: () => store.updateSettings({ wheelLists: [] }),
    }),
  );

  for (const category of store.state.categories) {
    const on = chosen.includes(category.id);
    row.append(
      el('button', {
        class: 'list-chip',
        type: 'button',
        style: `--task:${category.color}`,
        'aria-pressed': String(on),
        'aria-label': `${category.name}${on ? ' — in the draw' : ''}`,
        onClick: () =>
          store.updateSettings({
            wheelLists: on ? chosen.filter((id) => id !== category.id) : [...chosen, category.id],
          }),
      }, [
        el('span', { 'aria-hidden': 'true', text: category.emoji }),
        el('span', { text: category.name }),
      ]),
    );
  }

  return row;
}

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The winner plus enough others to fill the face, in random order. */
function sliceSet(tasks, winner) {
  if (tasks.length <= MAX_SLICES) return shuffle(tasks);
  const others = shuffle(tasks.filter((t) => t.id !== winner.id)).slice(0, MAX_SLICES - 1);
  return shuffle([winner, ...others]);
}

function paint(face, slices) {
  const step = 360 / slices.length;
  const stops = slices
    .map((task, i) => `${task.color} ${i * step}deg ${(i + 1) * step}deg`)
    .join(', ');
  face.style.background = `conic-gradient(${stops})`;
}

export function renderRandomizer(root) {
  clear(root);
  const tasks = eligibleTasks();
  const narrowed = chosenLists().length > 0;
  const card = el('div', { class: 'card paper' });

  card.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Randomizer' }),
      el('span', { class: 'sub', text: 'no thinking required — just spin' }),
    ]),
  );

  if (store.state.categories.length > 1) card.append(listPicker());

  // The wheel needs something to choose between; with less, say which, since
  // an empty wheel after narrowing the lists is otherwise a puzzle.
  if (tasks.length < 2) {
    card.append(
      el('div', { class: 'empty' }, [
        narrowed
          ? 'Not enough in those lists to draw from.'
          : 'Add a couple of tasks and the wheel has something to pick.',
        narrowed
          ? el('div', { class: 'hint', text: 'Pick another list, or All lists.' })
          : null,
      ]),
    );
    root.append(card);
    return;
  }

  const face = el('div', { class: 'wheel' });
  let slices = shuffle(tasks).slice(0, MAX_SLICES);
  paint(face, slices);

  const result = el('div', { class: 'wheel-result', 'aria-live': 'polite' });

  const spinButton = el('button', {
    class: 'btn btn-primary',
    text: 'Spin',
    onClick: () => {
      if (spinning) return;
      spinning = true;
      spinButton.disabled = true;
      clear(result);

      // Winner is drawn from the whole list, so nothing is ever excluded.
      const winner = tasks[Math.floor(Math.random() * tasks.length)];
      slices = sliceSet(tasks, winner);
      paint(face, slices);

      const index = slices.findIndex((t) => t.id === winner.id);
      const step = 360 / slices.length;
      const centre = index * step + step / 2;
      // The pointer sits at the top, so bring the winning slice up to it.
      const target = (360 - centre) % 360;
      rotation += 360 * 5 + ((target - (rotation % 360)) + 360) % 360;
      face.style.transform = `rotate(${rotation}deg)`;

      setTimeout(() => {
        const category = store.categoryById(winner.categoryId);
        result.append(
          el('span', {
            class: 'cat',
            text: category ? `${category.emoji} ${category.name}` : 'Task',
          }),
          document.createTextNode(winner.name),
        );
        spinning = false;
        spinButton.disabled = false;
      }, 4300);
    },
  });

  card.append(
    el('div', { class: 'wheel-wrap' }, [
      el('div', { class: 'wheel-frame' }, [
        el('div', { class: 'wheel-pointer' }),
        face,
        el('div', { class: 'wheel-hub' }),
      ]),
      spinButton,
      result,
    ]),
  );

  card.append(
    el('p', {
      class: 'muted',
      style: 'text-align:center; margin-top:14px',
      text: tasks.length > MAX_SLICES
        ? `${tasks.length} tasks in the draw — eight show on the wheel each spin.`
        : `${tasks.length} tasks in the draw.`,
    }),
  );

  root.append(card);
}
