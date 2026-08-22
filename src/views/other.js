import { clear, el } from '../lib/dom.js';

/* The "Other" section: a row of four evenly spaced buttons across the top,
   with whichever one is chosen rendered underneath. Keeps the bottom bar down
   to three tabs without burying anything more than one tap deep. */

export const OTHER_ROUTES = ['randomizer', 'timer', 'stats', 'settings'];

const LABELS = {
  randomizer: { text: 'Randomizer', icon: '🎯' },
  timer: { text: 'Timer', icon: '⏱️' },
  stats: { text: 'Stats', icon: '📈' },
  settings: { text: 'Settings', icon: '⚙️' },
};

/** The four-button switcher, shown above every Other sub-view. */
export function otherSwitcher(activeId) {
  return el(
    'div',
    { class: 'other-switch', role: 'tablist', 'aria-label': 'More views' },
    OTHER_ROUTES.map((id) =>
      el('a', {
        class: 'other-tab',
        href: `#/${id}`,
        role: 'tab',
        'aria-selected': String(id === activeId),
      }, [
        el('span', { class: 'other-icon', text: LABELS[id].icon, 'aria-hidden': 'true' }),
        el('span', { text: LABELS[id].text }),
      ]),
    ),
  );
}

/** The bare Other tab, before a sub-view is picked. */
export function renderOther(root) {
  clear(root);
  root.append(
    otherSwitcher(null),
    el('div', { class: 'card paper' }, [
      el('div', { class: 'empty' }, [
        'Pick one above.',
        el('div', {
          class: 'hint',
          text: 'The wheel, the timer, your stats, and everything you can change.',
        }),
      ]),
    ]),
  );
}
