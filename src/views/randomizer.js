import { clear, el } from '../lib/dom.js';
import { store } from '../lib/store.js';

/* The wheel picks uniformly from every task, ignoring frequency, schedule and
   history. That's the point — it's for when you're willing but not choosy.

   Only eight slices fit legibly, so with a longer list the winner is drawn
   from all tasks first and the face is rebuilt around it. Every task stays
   reachable; the wheel is the animation, not the lottery. */

const MAX_SLICES = 8;
let rotation = 0;
let spinning = false;

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
  const tasks = store.state.tasks.filter((t) => t.active !== false);
  const card = el('div', { class: 'card paper' });

  card.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Randomizer' }),
      el('span', { class: 'sub', text: 'no thinking required — just spin' }),
    ]),
  );

  if (tasks.length < 2) {
    card.append(
      el('div', { class: 'empty' }, [
        'Add a couple of tasks first.',
        el('div', { class: 'hint', text: 'The wheel needs at least two to choose between.' }),
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

  if (tasks.length > MAX_SLICES) {
    card.append(
      el('p', {
        class: 'muted',
        style: 'text-align:center; margin-top:14px',
        text: `All ${tasks.length} of your tasks are in the draw — eight show on the wheel each spin.`,
      }),
    );
  }

  root.append(card);
}
