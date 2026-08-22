import './styles/app.css';
import { clear, el, svg, toast } from './lib/dom.js';
import { store } from './lib/store.js';
import { formatLong, todayISO } from './lib/dates.js';
import { registerServiceWorker } from './lib/pwa.js';
import { renderToday } from './views/today.js';
import { renderCategories } from './views/categories.js';
import { renderRandomizer } from './views/randomizer.js';
import { renderTimer, teardownTimer } from './views/timer.js';
import { timer } from './lib/timer.js';
import { renderStats } from './views/stats.js';
import { applyTheme, renderSettings } from './views/settings.js';
import { OTHER_DEFAULT, OTHER_ROUTES, otherSwitcher } from './views/other.js';

/* Hash routing keeps GitHub Pages happy: every URL is really index.html, so
   there are no 404s on refresh and no rewrite rules to configure.

   Three sections, because three is what fits comfortably along the bottom of a
   phone. Calendar isn't one of them — it lives inside Today as the week and
   month zoom levels. The four remaining screens sit behind Other. */

const SECTIONS = [
  { id: 'today', label: 'Today', href: '#/today', icon: '📋' },
  { id: 'lists', label: 'Lists', href: '#/lists', icon: '🗂️' },
  { id: 'other', label: 'Other', href: `#/${OTHER_DEFAULT}`, icon: '⋯' },
];

const VIEWS = {
  today: { title: 'Today', render: renderToday },
  lists: { title: 'Lists', render: renderCategories },
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

/* The clock.

   A drawn alarm clock in the app's own palette, in the flat hand-drawn style
   of the reference. Tapping it swaps the wordmark and its line for the date
   and time, and tapping again puts them back — so the time is always one tap
   away without permanently taking the masthead's best real estate. */

let showTime = false;

function clockIcon() {
  return svg('svg', { viewBox: '0 0 64 64', fill: 'none', 'aria-hidden': 'true' }, [
    // winder on top
    svg('path', {
      d: 'M26 13c0-3 2.7-4.6 6-4.6S38 10 38 13Z',
      fill: 'var(--rust)', stroke: 'var(--ink)', 'stroke-width': '2.6',
      'stroke-linejoin': 'round',
    }),
    svg('path', { d: 'M29 9v4M32 8.6v4.4M35 9v4', stroke: 'var(--ink)', 'stroke-width': '1.6' }),
    // body
    svg('rect', {
      x: '8', y: '14', width: '48', height: '42', rx: '13',
      fill: 'var(--sage)', stroke: 'var(--ink)', 'stroke-width': '2.8',
    }),
    // face
    svg('rect', {
      x: '15', y: '20', width: '32', height: '30', rx: '8',
      fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': '2.4',
    }),
    // ticks
    svg('path', {
      d: 'M31 24v2.4M31 43.6V46M21.5 35h2.4M38.1 35h2.4',
      stroke: 'var(--ink)', 'stroke-width': '1.8', 'stroke-linecap': 'round',
    }),
    // hands
    svg('path', {
      d: 'M31 35V27M31 35l6 3',
      stroke: 'var(--ink)', 'stroke-width': '2.6', 'stroke-linecap': 'round',
    }),
    svg('circle', { cx: '31', cy: '35', r: '3', fill: 'var(--rust)', stroke: 'var(--ink)', 'stroke-width': '1.8' }),
  ]);
}

function tickClock() {
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = formatLong(todayISO());
  for (const node of document.querySelectorAll('[data-clock-time]')) node.textContent = time;
  for (const node of document.querySelectorAll('[data-clock-date]')) node.textContent = date;
}

/* The masthead: a centred wordmark on a striped panel, and the clock button
   that swaps it for the date and time. */
function buildMasthead(onToggleTime) {
  const clockButton = el('button', {
    class: 'clock-btn',
    'aria-pressed': String(showTime),
    'aria-label': showTime ? 'Show the title' : 'Show the date and time',
    title: showTime ? 'Show the title' : 'Show the date and time',
    onClick: onToggleTime,
  }, [clockIcon()]);

  const heading = showTime
    ? el('div', { class: 'clock-face' }, [
        el('div', { class: 'clock-time', dataset: { clockTime: '' } }),
        el('div', { class: 'clock-date', dataset: { clockDate: '' } }),
      ])
    : el('div', {}, [
        el('h1', { class: 'wordmark' }, ['10 minutes ', el('em', { text: 'to spare' })]),
        el('p', { class: 'wordmark-sub', text: 'tiny tasks, real results' }),
      ]);

  return el('header', { class: 'masthead' }, [
    el('div', { class: 'masthead-panel' }, [
      el('div', { class: 'stripes', 'aria-hidden': 'true' }),
      clockButton,
      el('div', { class: 'masthead-inner' }, [heading]),
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
        href: section.href,
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
  mastheadSlot.append(
    buildMasthead(() => {
      showTime = !showTime;
      route({ nav, outlet, mastheadSlot });
    }),
  );
  tickClock();

  if (currentView === 'timer' && id !== 'timer') teardownTimer(outlet);
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
  store.addEventListener('change', () => go());

  go();

  tickClock();
  setInterval(() => {
    tickClock();
    timer.tick();
  }, 1000);

  timer.addEventListener('done', () => {
    toast("Time's up ✦");
    try {
      if (store.state.settings.notificationsEnabled && Notification.permission === 'granted') {
        new Notification('10 Minutes to Spare', {
          body: "Time's up — how did you get on?",
        });
      }
    } catch {
      // Notifications are a nicety; never let them break the timer.
    }
  });

  registerServiceWorker(import.meta.env.BASE_URL);

  // A day can roll over while the app sits open on a phone.
  setInterval(() => store.refreshSchedule(), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) store.refreshSchedule();
  });
}

boot();
