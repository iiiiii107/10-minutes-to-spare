import { clear, el } from '../lib/dom.js';
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
    card.append(
      el('div', { class: 'empty' }, [
        'Nothing finished yet.',
        el('div', { class: 'hint', text: 'Tick one small thing off and this page starts filling in.' }),
      ]),
    );
    root.append(card);
    return;
  }

  const streak = currentStreak(instances);
  const best = longestStreak(instances);
  const busiest = busiestCategory(instances, tasks, categories);

  card.append(
    el('div', { class: 'stat-grid' }, [
      stat(streak, 'day streak', streak >= best && streak > 1 ? 'your best yet' : null),
      stat(best, 'longest streak'),
      stat(completedThisMonth(instances), 'this month'),
      stat(total, 'all time'),
    ]),
  );

  card.append(
    el('div', { style: 'margin-top:20px' }, [
      el('div', { class: 'k', style: 'font-size:10.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.07em', text: 'Last 30 days' }),
      sparkline(dailyHistory(instances, 30)),
    ]),
  );

  const extras = el('div', { class: 'stat-grid', style: 'margin-top:20px' }, [
    stat(
      formatDuration(minutesReclaimed(instances)),
      'time reclaimed',
      'at ten minutes a task',
    ),
    busiest?.category
      ? stat(
          `${busiest.category.emoji}`,
          busiest.category.name,
          `${busiest.count} done — your busiest`,
        )
      : null,
  ]);
  card.append(extras);

  root.append(card);
}
