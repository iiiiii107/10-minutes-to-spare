/* Dates are handled as 'YYYY-MM-DD' strings throughout the app.
   Using strings rather than Date objects keeps every comparison timezone-proof:
   a task due "today" means today where the user is, not UTC. */

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso) {
  return fromISO(iso).getDay();
}

export function isWeekend(iso) {
  const d = dayOfWeek(iso);
  return d === 0 || d === 6;
}

/** Monday-based by default; set weekStartsMonday false for Sunday weeks. */
export function startOfWeek(iso, weekStartsMonday = true) {
  const dow = dayOfWeek(iso);
  const offset = weekStartsMonday ? (dow === 0 ? 6 : dow - 1) : dow;
  return addDays(iso, -offset);
}

export function daysBetween(fromIso, toIso) {
  const ms = fromISO(toIso) - fromISO(fromIso);
  return Math.round(ms / 86400000);
}

export function monthOf(iso) {
  return Number(iso.slice(5, 7));
}

export function formatLong(iso) {
  return fromISO(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatShort(iso) {
  return fromISO(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}
