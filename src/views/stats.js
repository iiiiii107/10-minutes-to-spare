import { clear, el } from '../lib/dom.js';
import { fromISO } from '../lib/dates.js';
import { store } from '../lib/store.js';
import {
  busiestCategory, completedThisMonth, completedTotal, currentStreak,
  dailyHistory, formatDuration, longestStreak, minutesReclaimed,
} from '../lib/stats.js';

/* Encouragement, not a scoreboard. Every number here is derived from the
   completed instances, so nothing can drift out of step with reality. */

const CHEERS = [
  'Small things add up.',
  'Ten minutes at a time.',
  'That is a lot of little wins.',
  'The pile keeps shrinking.',
  'Momentum looks good on you.',
];

function stat(value, key, note) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'v', text: String(value) }),
    el('div', { class: 'k', text: key }),
    note ? el('div', { class: 'note', text: note }) : null,
  ]);
}

function sparkline(history) {
  const max = Math.max(1, ...history.map((d) => d.count));
  const bars = el('div', { class: 'spark', 'aria-hidden': 'true' });
  for (const day of history) {
    bars.append(
      el('div', {
        class: day.count === 0 ? 'empty-day' : '',
        style: `height:${Math.max(2, (day.count / max) * 100)}%`,
        title: `${day.date}: ${day.count}`,
      }),
    );
  }
  return bars;
}

export function renderStats(root) {
  clear(root);
  const { instances, tasks, categories } = store.state;

  const total = completedTotal(instances);
  const card = el('div', { class: 'card paper' });

  card.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Stats' }),
      el('span', { class: 'sub', text: CHEERS[total % CHEERS.length] }),
    ]),
  );

  if (total === 0) {
    root.append(card, archiveCard());
    return;
  }

  const streak = currentStreak(instances);
  const best = longestStreak(instances);
  const busiest = busiestCategory(instances, tasks, categories);
  const minutes = store.state.settings.minutesPerTask ?? 10;

  // Everything is always counted; these settings only decide what's shown.
  const shown = (id) => store.state.settings.statsVisible?.[id] !== false;

  const tiles = [
    shown('streak')
      ? stat(streak, 'day streak', streak >= best && streak > 1 ? 'your best yet' : null)
      : null,
    shown('longestStreak') ? stat(best, 'longest streak') : null,
    shown('thisMonth') ? stat(completedThisMonth(instances), 'this month') : null,
    shown('allTime') ? stat(total, 'all time') : null,
  ].filter(Boolean);

  if (tiles.length) card.append(el('div', { class: 'stat-grid' }, tiles));

  if (shown('history')) {
    card.append(
      el('div', { style: 'margin-top:20px' }, [
        el('div', { class: 'stat-caption', text: 'Last 30 days' }),
        sparkline(dailyHistory(instances, 30)),
      ]),
    );
  }

  const extras = [
    shown('timeReclaimed')
      ? stat(
          formatDuration(minutesReclaimed(instances, minutes)),
          'time reclaimed',
          `at ${minutes} minute${minutes === 1 ? '' : 's'} a task`,
        )
      : null,
    shown('busiest') && busiest?.category
      ? stat(
          `${busiest.category.emoji}`,
          busiest.category.name,
          `${busiest.count} done — your busiest`,
        )
      : null,
  ].filter(Boolean);

  if (extras.length) {
    card.append(el('div', { class: 'stat-grid', style: 'margin-top:20px' }, extras));
  }

  root.append(card, archiveCard());
}

/**
 * Pages that have been torn off. Kept purely as a record — the numbers above
 * count every completion whether its page was torn or not.
 */
function archiveCard() {
  const pages = store.archivedPages();
  if (!pages.length) return null;

  const card = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Torn pages' }),
      el('span', { class: 'sub', text: 'the pad you have worked through' }),
    ]),
  ]);

  for (const page of pages.slice(0, 24)) {
    card.append(
      el('div', { class: 'archive-page' }, [
        el('div', { class: 'archive-head' }, [
          el('span', { text: page.label ? page.label[0].toUpperCase() + page.label.slice(1) : page.key }),
          el('span', {
            class: 'archive-when',
            text: fromISO(page.tornAt.slice(0, 10)).toLocaleDateString(undefined, {
              day: 'numeric', month: 'short', year: 'numeric',
            }),
          }),
        ]),
        el(
          'div',
          { class: 'archive-items' },
          page.items.slice(0, 20).map((item) =>
            el('span', { class: 'archive-item', style: `--task:${item.color}`, text: item.name }),
          ),
        ),
      ]),
    );
  }

  return card;
}
