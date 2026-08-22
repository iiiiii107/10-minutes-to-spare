import { addDays, todayISO } from './dates.js';

/* Stats are derived from completed instances only — nothing extra is stored,
   so the numbers can never drift out of sync with the task history. */

/** Default minutes per task for the "time reclaimed" figure; overridable. */
export const DEFAULT_MINUTES_PER_TASK = 10;

function completedDates(instances) {
  const set = new Set();
  for (const inst of instances) {
    if (inst.status === 'complete' && inst.completedAt) {
      set.add(inst.completedAt.slice(0, 10));
    }
  }
  return set;
}

/** Consecutive days ending today (or yesterday, if today isn't done yet). */
export function currentStreak(instances, today = todayISO()) {
  const dates = completedDates(instances);
  if (dates.size === 0) return 0;

  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;

  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(instances) {
  const dates = [...completedDates(instances)].sort();
  if (dates.length === 0) return 0;

  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i += 1) {
    run = addDays(dates[i - 1], 1) === dates[i] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export function completedThisMonth(instances, today = todayISO()) {
  const prefix = today.slice(0, 7);
  return instances.filter(
    (i) => i.status === 'complete' && i.completedAt?.startsWith(prefix),
  ).length;
}

export function completedTotal(instances) {
  return instances.filter((i) => i.status === 'complete').length;
}

export function completedOn(instances, date) {
  return instances.filter(
    (i) => i.status === 'complete' && i.completedAt?.slice(0, 10) === date,
  ).length;
}

/** Completion counts for the last N days, oldest first — drives the sparkline. */
export function dailyHistory(instances, days = 30, today = todayISO()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    out.push({ date, count: completedOn(instances, date) });
  }
  return out;
}

export function minutesReclaimed(instances, minutesPerTask = DEFAULT_MINUTES_PER_TASK) {
  return completedTotal(instances) * minutesPerTask;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}, ${hours % 24} hr`;
}

/** Which category has the most completions — a gentle nudge, not a ranking. */
export function busiestCategory(instances, tasks, categories) {
  const byCategory = new Map();
  for (const inst of instances) {
    if (inst.status !== 'complete') continue;
    const task = tasks.find((t) => t.id === inst.taskId);
    if (!task) continue;
    byCategory.set(task.categoryId, (byCategory.get(task.categoryId) || 0) + 1);
  }
  let best = null;
  for (const [id, count] of byCategory) {
    if (!best || count > best.count) {
      best = { id, count, category: categories.find((c) => c.id === id) };
    }
  }
  return best;
}

/** A milestone worth celebrating, or null. Checked after each completion. */
export function milestoneFor(streak, total) {
  if ([7, 14, 30, 50, 100, 200, 365].includes(streak)) {
    return `${streak}-day streak!`;
  }
  if ([10, 25, 50, 100, 250, 500, 1000].includes(total)) {
    return `${total} tasks done!`;
  }
  return null;
}
