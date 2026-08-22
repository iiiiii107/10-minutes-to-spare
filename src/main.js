import './styles/app.css';
import { clear, el, svg } from './lib/dom.js';
import { store } from './lib/store.js';
import { completedOnDate } from './lib/schedule.js';
import { currentStreak } from './lib/stats.js';
import { formatLong, todayISO } from './lib/dates.js';
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

/* The masthead is the one piece of pure brand in the app: a centred wordmark
   on a striped panel, with two small pills carrying the day and the day's
   progress. Rebuilt on each route so the pills stay accurate. */
function buildMasthead() {
  const done = completedOnDate(store.state.instances, todayISO()).length;
  const streak = currentStreak(store.state.instances);

  const pills = el('div', { class: 'pills' }, [
    el('span', { class: 'pill', text: formatLong(todayISO()) }),
    done
      ? el('span', { class: 'pill pill-accent', text: `${done} done today` })
      : null,
    streak > 1
      ? el('span', { class: 'pill pill-quiet', text: `${streak}-day streak` })
      : null,
  ]);

  return el('header', { class: 'masthead' }, [
    el('div', { class: 'masthead-panel' }, [
      el('div', { class: 'stripes', 'aria-hidden': 'true' }),
      el('div', { class: 'masthead-inner' }, [
        svg('svg', { class: 'mark', viewBox: '0 0 48 48', fill: 'none', 'aria-hidden': 'true' }, [
          svg('circle', { cx: '24', cy: '27', r: '14', stroke: 'var(--ink-blue)', 'stroke-width': '2' }),
          svg('path', { d: 'M24 11V6', stroke: 'var(--ink)', 'stroke-width': '2', 'stroke-linecap': 'round' }),
          svg('circle', { cx: '24', cy: '4.5', r: '2.6', fill: 'var(--butter)', stroke: 'var(--ink)', 'stroke-width': '1.6' }),
          svg('path', { d: 'M24 27V19', stroke: 'var(--ink-blue)', 'stroke-width': '2', 'stroke-linecap': 'round' }),
          svg('path', { d: 'M24 27h6', stroke: 'var(--ink-blue)', 'stroke-width': '2', 'stroke-linecap': 'round' }),
        ]),
        el('h1', { class: 'wordmark' }, [
          '10 ',
          el('em', { text: 'minutes' }),
          ' to spare',
        ]),
        el('p', { class: 'wordmark-sub', text: 'tiny tasks, real results' }),
        pills,
      ]),
    ]),
  ]);
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
  const mastheadSlot = el('div');

  // Nav sits before the content in the DOM so it reads above it on desktop;
  // on phones it's position:fixed, so it pins to the bottom regardless.
  app.append(
    mastheadSlot,
    marquee,
    nav,
    el('main', { class: 'app' }, [outlet]),
  );

  return { nav, outlet, mastheadSlot };
}

function route({ nav, outlet, mastheadSlot }) {
  const id = currentViewId();
  const view = VIEWS[id];
  const section = sectionFor(id);

  clear(mastheadSlot);
  mastheadSlot.append(buildMasthead());

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
