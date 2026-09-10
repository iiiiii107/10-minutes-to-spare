import { store } from './store.js';
import { slotEnd, slotMinutes } from './schedule.js';
import { addDays, todayISO } from './dates.js';

/* Writing the day into Google Calendar.

   Only tasks with a time slot go across — an all-day task has no place to sit
   in a calendar, and filling one with a dozen untimed blocks helps nobody.
   Nothing comes back the other way: the app stays the source of truth, and
   the calendar is a copy for the benefit of everything else that reads it.

   The site is static, so there is no server to hold a refresh token. Access
   tokens come from Google Identity Services and last about an hour. Once you
   have granted the permission, a new one can be fetched without a prompt, so
   in practice the app asks once and quietly renews after that. If Google does
   want to ask again, the Settings card says so rather than failing silently.

   Event ids are derived from the instance, not stored and looked up. The same
   task on the same day works out to the same id on every device, so two
   phones syncing the same day update one event instead of making two. */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** How far ahead to write.

    Four weeks. The scheduler plans 56 days out, so every day in this window
    has real instances behind it rather than merely ungenerated ones — going
    further would start writing days the app has not decided on yet. */
const WINDOW_DAYS = 28;

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function calendarConfigured() {
  return Boolean(clientId);
}

/* ---------- the access token ---------- */

let token = null;
let tokenExpires = 0;
let tokenClient = null;
let gisLoading = null;

/** Loads Google's client library once. */
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;

  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google could not be reached.'));
    document.head.append(script);
  });
  return gisLoading;
}

async function client() {
  if (tokenClient) return tokenClient;
  await loadGis();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: () => {}, // replaced per request below
  });
  return tokenClient;
}

/**
 * A usable access token.
 * @param {boolean} interactive true to allow Google to show its consent
 *   screen. Must be called from a click when true, or the popup is blocked.
 */
async function accessToken({ interactive = false } = {}) {
  if (token && Date.now() < tokenExpires - 60_000) return token;

  const gis = await client();
  return new Promise((resolve, reject) => {
    gis.callback = (response) => {
      if (response.error) {
        reject(Object.assign(new Error(response.error), { code: response.error }));
        return;
      }
      token = response.access_token;
      tokenExpires = Date.now() + Number(response.expires_in || 3600) * 1000;
      resolve(token);
    };
    try {
      // An empty prompt means "only if you don't have to ask" — which works
      // once the permission has been granted before.
      gis.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (err) {
      reject(err);
    }
  });
}

/** Ask for the permission. Call this straight from a click. */
export async function connectCalendar() {
  await accessToken({ interactive: true });
  await store.updateSettings({ calendarSync: true });
  return true;
}

export async function disconnectCalendar() {
  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {
      // Revoking is a courtesy; losing the token locally is the part that matters.
    }
  }
  token = null;
  tokenExpires = 0;
  await store.updateSettings({ calendarSync: false });
}

export function calendarConnected() {
  return store.state?.settings?.calendarSync === true;
}

/* ---------- what goes across ---------- */

/** Event ids must be base32hex — a–v and 0–9. This keeps them stable. */
function eventIdFor(instance) {
  let hash = 0x811c9dc5;
  const key = `${instance.taskId}|${instance.scheduledDate}`;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Pad out to a comfortable length; ids must be at least 5 characters.
  const base = hash.toString(32) + key.length.toString(32);
  return `tms${base.replace(/[^0-9a-v]/g, '0')}`.padEnd(8, '0').slice(0, 40);
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function eventBody(task, instance, settings) {
  const done = instance.status === 'complete';
  return {
    id: eventIdFor(instance),
    summary: `${done ? '✓ ' : ''}${task.name}`,
    description:
      'From 10 Minutes to Spare. The time is a plan, not a deadline — ' +
      'the task counts whenever you do it that day.',
    start: { dateTime: `${instance.scheduledDate}T${task.startTime}:00`, timeZone },
    end: { dateTime: `${instance.scheduledDate}T${slotEnd(task, settings)}:00`, timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 5 }] },
    source: { title: '10 Minutes to Spare', url: window.location.origin + window.location.pathname },
  };
}

async function call(method, path, body, bearer) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204 || response.status === 404 || response.status === 409) {
    return { status: response.status, data: null };
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(data?.error?.message || `Calendar said ${response.status}`), {
      status: response.status,
    });
  }
  return { status: response.status, data };
}

/** Everything in the window that has somewhere to sit in a calendar. */
function slotted(today = todayISO()) {
  const until = addDays(today, WINDOW_DAYS);
  const byId = new Map(store.state.tasks.map((t) => [t.id, t]));

  return store.state.instances
    .filter((i) => i.scheduledDate >= today && i.scheduledDate <= until)
    .map((i) => ({ instance: i, task: byId.get(i.taskId) }))
    .filter(({ task }) => task && slotMinutes(task) != null);
}

/**
 * Push the window across. Safe to call whenever — an event that
 * hasn't changed is written with the same values, and one that has moved is
 * updated in place rather than duplicated.
 * @returns {Promise<{written: number, removed: number}>}
 */
export async function syncCalendar({ interactive = false } = {}) {
  if (!calendarConfigured()) throw new Error('Calendar sync is not set up for this site.');

  const bearer = await accessToken({ interactive });
  const settings = store.state.settings;
  const wanted = slotted();
  const sent = { ...(store.state.calendarEvents || {}) };

  let written = 0;
  for (const { task, instance } of wanted) {
    const body = eventBody(task, instance, settings);
    // Creating with our own id is the whole trick: a second device writing the
    // same task on the same day lands on the same event.
    const made = await call('POST', '', body, bearer);
    if (made.status === 409) {
      await call('PATCH', `/${body.id}`, { ...body, id: undefined }, bearer);
    }
    sent[body.id] = instance.scheduledDate;
    written += 1;
  }

  // Anything we wrote before and no longer want — a task deleted, a slot
  // removed, a day rearranged — comes back out.
  const keep = new Set(wanted.map(({ instance }) => eventIdFor(instance)));
  const today = todayISO();
  let removed = 0;
  for (const [id, date] of Object.entries(sent)) {
    if (keep.has(id) || date < today) continue;
    await call('DELETE', `/${id}`, null, bearer);
    delete sent[id];
    removed += 1;
  }

  await store.setCalendarEvents(sent);
  return { written, removed };
}
