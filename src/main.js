import './styles/app.css';
import { clear, el } from './lib/dom.js';
import { store } from './lib/store.js';
import { renderToday } from './views/today.js';
import { renderCategories } from './views/categories.js';
import { renderRandomizer } from './views/randomizer.js';
import { renderTimer, teardownTimer } from './views/timer.js';
import { renderStats } from './views/stats.js';
import { applyTheme, renderSettings } from './views/settings.js';
import { OTHER_ROUTES, otherSwitcher, renderOther } from './views/other.js';

/* Hash routing keeps GitHub Pages happy: every URL is really index.html, so
   there are no 404s on refresh and no rewrite rules to configure.

   Three sections, because three is what fits comfortably along the bottom of a
   phone. Calendar isn't one of them — it lives inside Today as the week and
   month zoom levels. The four remaining screens sit behind Other. */

const SECTIONS = [
  { id: 'today', label: 'Today', icon: '📋' },
  { id: 'lists', label: 'Lists', icon: '🗂️' },
  { id: 'other', label: 'Other', icon: '⋯' },
];

const VIEWS = {
  today: { title: 'Today', render: renderToday },
  lists: { title: 'Lists', render: renderCategories },
  other: { title: 'More', render: renderOther },
  randomizer: { title: 'Randomizer', render: renderRandomizer },
  timer: { title: 'Timer', render: renderTimer },
  stats: { title: 'Stats', render: renderStats },
  settings: { title: 'Settings', render: renderSettings },
};

/** Which bottom-bar tab lights up for a given view. */
function sectionFor(viewId) {
  if (viewId === 'today' || viewId === 'lists') return viewId;
  return 'other';
}

const MARQUEE = [
  'Got ten minutes?',
  'Small things, done often',
  'Nothing here takes long',
];

let currentView = 'today';

function currentViewId() {
  const id = location.hash.replace(/^#\/?/, '') || 'today';
  return VIEWS[id] ? id : 'today';
}

function buildChrome() {
  const app = document.getElementById('app');
  clear(app);

  const marquee = el('div', { class: 'marquee', 'aria-hidden': 'true' }, [
    el(
      'div',
      { class: 'marquee-track' },
      Array.from({ length: 12 }, (_, i) =>
        el('span', {}, [MARQUEE[i % MARQUEE.length], el('i', { text: ' ✦' })]),
      ),
    ),
  ]);

  const nav = el('nav', { class: 'nav', 'aria-label': 'Sections' });
  for (const section of SECTIONS) {
    nav.append(
      el('a', {
        class: 'nav-tab',
        href: `#/${section.id}`,
        dataset: { section: section.id },
      }, [
        el('span', { class: 'nav-icon', text: section.icon, 'aria-hidden': 'true' }),
        el('span', { class: 'nav-label', text: section.label }),
      ]),
    );
  }

  const outlet = el('div', { id: 'view' });

  app.append(
    el('header', { class: 'app' }, [
      el('div', { class: 'masthead' }, [
        el('div', { class: 'wordmark' }, [
          '10 minutes to spare',
          el('span', { text: 'tiny tasks, real results' }),
        ]),
      ]),
    ]),
    marquee,
    el('main', { class: 'app' }, [outlet]),
    nav,
  );

  return { nav, outlet };
}

function route({ nav, outlet }) {
  const id = currentViewId();
  const view = VIEWS[id];
  const section = sectionFor(id);

  if (currentView === 'timer' && id !== 'timer') teardownTimer();
  currentView = id;

  document.body.dataset.view = id;
  document.body.dataset.section = section;

  for (const tab of nav.children) {
    if (tab.dataset.section === section) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }

  clear(outlet);

  // Every Other sub-view keeps its four-button switcher on top.
  if (OTHER_ROUTES.includes(id)) {
    outlet.append(otherSwitcher(id));
    const body = el('div');
    outlet.append(body);
    view.render(body);
  } else {
    view.render(outlet);
  }

  document.title = `${view.title} · 10 Minutes to Spare`;
}

async function boot() {
  await store.init();
  applyTheme(store.state.settings.theme || 'system');

  const chrome = buildChrome();
  const go = () => route(chrome);

  window.addEventListener('hashchange', go);

  // Views re-render on any state change, so completing a task updates the
  // calendar and stats without those views knowing about each other.
  store.addEventListener('change', () => {
    if (currentView !== 'timer') go();
  });

  go();

  // A day can roll over while the app sits open on a phone.
  setInterval(() => store.refreshSchedule(), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) store.refreshSchedule();
  });
}

boot();
