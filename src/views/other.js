import { el } from '../lib/dom.js';

/* The four screens behind the Other tab.

   These used to sit in a second full-width bar under the main nav, which read
   as two competing rows of navigation. It's now one compact segmented control
   — the same component the day / week / month switch uses — so it reads as
   part of the page rather than a second navbar. */

export const OTHER_ROUTES = ['randomizer', 'timer', 'stats', 'settings'];

/** Tapping "Other" lands here rather than on a menu asking you to choose. */
export const OTHER_DEFAULT = 'randomizer';

const LABELS = {
  randomizer: 'Randomizer',
  timer: 'Timer',
  stats: 'Stats',
  settings: 'Settings',
};

export function otherSwitcher(activeId) {
  return el(
    'div',
    { class: 'seg seg-wide', role: 'tablist', 'aria-label': 'More views' },
    OTHER_ROUTES.map((id) =>
      el('a', {
        class: 'seg-item',
        href: `#/${id}`,
        role: 'tab',
        text: LABELS[id],
        'aria-selected': String(id === activeId),
      }),
    ),
  );
}
