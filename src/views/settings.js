import { clear, el, svg, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { storage, STAT_KEYS } from '../lib/storage.js';
import { currentAccount, signIn, signOutOfSync, syncConfigured } from '../lib/sync.js';
import { DAY_FULL, DAY_SHORT } from '../lib/dates.js';

/* Settings. The principle here: the app counts everything regardless, and
   these choices only decide what's shown and how the schedule behaves. */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function card(title, sub, children) {
  return el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: title }),
      sub ? el('span', { class: 'sub', text: sub }) : null,
    ]),
    ...[].concat(children),
  ]);
}

function toggleRow(label, checked, onChange, description) {
  const button = el('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(checked),
    'aria-label': label,
    onClick: () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  });

  return el('div', { class: 'row-between setting-row' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:700; font-size:14px', text: label }),
      description ? el('div', { class: 'muted', text: description }) : null,
    ]),
    button,
  ]);
}

/** A segmented control: options is [{value, label, aria}]. */
function segmented(options, value, onPick, { wide = false } = {}) {
  const wrap = el('div', { class: `seg${wide ? ' seg-wide' : ''}` });
  for (const option of options) {
    wrap.append(
      el('button', {
        type: 'button',
        class: 'seg-item',
        text: option.label,
        'aria-label': option.aria || option.label,
        'aria-selected': String(option.value === value),
        onClick: () => {
          for (const node of wrap.children) node.setAttribute('aria-selected', 'false');
          wrap.children[options.indexOf(option)].setAttribute('aria-selected', 'true');
          onPick(option.value);
        },
      }),
    );
  }
  return wrap;
}

function stepper(value, { min, max, suffix, onChange }) {
  const readout = el('span', {
    class: 'stepper-value',
    text: `${value}${suffix ? ` ${suffix}` : ''}`,
  });
  let current = value;

  const bump = (delta) => {
    current = Math.max(min, Math.min(max, current + delta));
    readout.textContent = `${current}${suffix ? ` ${suffix}` : ''}`;
    onChange(current);
  };

  return el('div', { class: 'stepper' }, [
    el('button', { class: 'btn btn-secondary btn-sm', text: '−', 'aria-label': 'Less', onClick: () => bump(-1) }),
    readout,
    el('button', { class: 'btn btn-secondary btn-sm', text: '+', 'aria-label': 'More', onClick: () => bump(1) }),
  ]);
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    toast('This browser has no notifications');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    toast('Notifications are blocked in your browser settings');
    return false;
  }
  return (await Notification.requestPermission()) === 'granted';
}

function monthColorGrid() {
  const grid = el('div', { class: 'month-color-grid' });

  MONTHS.forEach((name, index) => {
    const month = index + 1;
    grid.append(
      el('label', { class: 'month-color' }, [
        el('input', {
          type: 'color',
          value: store.state.settings.monthColors[month],
          'aria-label': `${name} colour`,
          onInput: (event) => {
            store.state.settings.monthColors[month] = event.target.value;
          },
          onChange: () => store.updateSettings({}),
        }),
        el('span', { text: name }),
      ]),
    );
  });

  return grid;
}

function exportData() {
  storage.exportAll().then((json) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', {
      href: url,
      download: `10-minutes-to-spare-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

function importData() {
  const picker = el('input', {
    type: 'file',
    accept: 'application/json',
    style: 'display:none',
    onChange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!confirm('This replaces everything currently saved. Continue?')) return;
      try {
        await storage.importAll(await file.text());
        toast('Data restored');
        location.reload();
      } catch {
        toast("That file couldn't be read");
      }
    },
  });
  document.body.append(picker);
  picker.click();
  picker.remove();
}

/** The four-colour G, drawn rather than fetched — nothing loads from Google. */
function googleMark() {
  return svg('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true', class: 'google-mark' }, [
    svg('path', { fill: '#4285F4', d: 'M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.7 5.2C42.2 36.2 45 30.7 45 24Z' }),
    svg('path', { fill: '#34A853', d: 'M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8 41.2 15.4 46 24 46Z' }),
    svg('path', { fill: '#FBBC05', d: 'M11.5 28.4A13.3 13.3 0 0 1 10.8 24c0-1.5.3-3 .7-4.4l-7.1-5.5A22 22 0 0 0 2 24c0 3.5.8 6.9 2.4 9.9Z' }),
    svg('path', { fill: '#EA4335', d: 'M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 29.9 2 24 2 15.4 2 8 6.8 4.4 14.1l7.1 5.5C13.3 14.4 18.2 10.6 24 10.6Z' }),
  ]);
}

/**
 * Sync. Signing in with a Google account puts your tasks in your own private
 * corner of the database, which is the only place your account can reach.
 */
function syncCard() {
  if (!syncConfigured()) {
    return card('Sync', 'not set up for this site yet', [
      el('p', { class: 'muted' }, [
        'This copy of the app has no Firebase project attached, so everything stays in this browser. ',
        'See the README for the five minutes it takes to add one.',
      ]),
    ]);
  }

  const account = currentAccount();

  if (!account) {
    return card('Sync', 'the same list on your phone and your computer', [
      el('p', { class: 'muted', style: 'margin-bottom:14px' }, [
        'Sign in and your tasks follow you between devices. They are stored under your own account — ',
        'nobody else who uses this site can see them.',
      ]),
      el('button', {
        class: 'btn btn-secondary google-btn',
        onClick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await signIn();
          } catch (err) {
            console.warn(err);
            toast("Couldn't sign in — try again");
            button.disabled = false;
          }
        },
      }, [googleMark(), el('span', { text: 'Sign in with Google' })]),
    ]);
  }

  return card('Sync', 'on — saving to your Google account', [
    el('div', { class: 'row-between setting-row' }, [
      el('div', { class: 'account' }, [
        account.photo
          ? el('img', { class: 'account-photo', src: account.photo, alt: '', referrerpolicy: 'no-referrer' })
          : el('span', { class: 'account-photo account-initial', text: (account.name || '?')[0] }),
        el('div', {}, [
          el('div', { style: 'font-weight:700; font-size:14px', text: account.name || 'Signed in' }),
          el('div', { class: 'muted', text: account.email || '' }),
        ]),
      ]),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Sign out',
        onClick: async () => {
          await signOutOfSync();
          toast('Signed out — back to this browser only');
        },
      }),
    ]),
    el('p', { class: 'muted', style: 'margin-top:12px' }, [
      'Changes save straight away and appear on your other devices within a second or two. ',
      'It keeps working with no connection and catches up when you are back.',
    ]),
  ]);
}

export function renderSettings(root) {
  clear(root);
  const { settings } = store.state;

  // ---- week & schedule ----
  const week = card('Week', 'how your week is shaped', [
    el('div', { class: 'field' }, [
      el('label', { text: 'Week starts on' }),
      // Listed Monday-first, which is how the week is usually read; the value
      // is still the day index the calendar works in.
      segmented(
        [1, 2, 3, 4, 5, 6, 0].map((index) => ({
          value: index,
          label: DAY_SHORT[index],
          aria: DAY_FULL[index],
        })),
        settings.weekStartsOn ?? 1,
        (value) => store.updateSettings({ weekStartsOn: value }),
        { wide: true },
      ),
    ]),

    el('div', { class: 'row-between setting-row' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:700; font-size:14px', text: 'Most tasks on a weekday' }),
        el('div', { class: 'muted', text: 'Anything over this moves to the next day. Weekends are never capped.' }),
      ]),
      stepper(settings.weekdayCap ?? 5, {
        min: 1,
        max: 12,
        onChange: (value) => store.updateSettings({ weekdayCap: value }),
      }),
    ]),
  ]);

  // ---- stats ----
  const statRows = STAT_KEYS.map((stat) =>
    toggleRow(
      stat.label,
      settings.statsVisible?.[stat.id] !== false,
      (value) =>
        store.updateSettings({
          statsVisible: { ...settings.statsVisible, [stat.id]: value },
        }),
    ),
  );

  const stats = card('Stats', 'everything is still counted — this is just what you see', [
    ...statRows,
    el('div', { class: 'row-between setting-row' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:700; font-size:14px', text: 'Minutes per task' }),
        el('div', { class: 'muted', text: 'Used to work out the time you have reclaimed.' }),
      ]),
      stepper(settings.minutesPerTask ?? 10, {
        min: 1,
        max: 60,
        suffix: 'min',
        onChange: (value) => store.updateSettings({ minutesPerTask: value }),
      }),
    ]),
  ]);

  // ---- appearance ----
  const appearance = card('Appearance', 'light, dark, or follow your device', [
    segmented(
      [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      settings.theme || 'system',
      (value) => {
        store.updateSettings({ theme: value });
        applyTheme(value);
      },
      { wide: true },
    ),
  ]);

  // ---- reminders ----
  const reminders = card('Reminders', null, [
    toggleRow(
      'Notifications',
      settings.notificationsEnabled === true,
      async (value) => {
        if (value) {
          const allowed = await requestNotifications();
          store.updateSettings({ notificationsEnabled: allowed });
          if (!allowed) renderSettings(root);
        } else {
          store.updateSettings({ notificationsEnabled: false });
        }
      },
      'A nudge when the timer runs out.',
    ),
  ]);

  const months = card('Month colours', 'tints the calendar month by month', [monthColorGrid()]);

  const signedIn = Boolean(currentAccount());
  const data = card('Your data', signedIn ? 'saved to your account' : 'saved on this device', [
    el('p', { class: 'muted', style: 'margin-bottom:14px' }, [
      signedIn
        ? 'A backup file is still worth keeping — export one any time, and importing replaces what is in your account.'
        : 'Everything lives in this browser. Export a backup before clearing your browser data, or to move it to another device by hand.',
    ]),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn btn-secondary btn-sm', text: 'Export backup', onClick: exportData }),
      el('button', { class: 'btn btn-secondary btn-sm', text: 'Import backup', onClick: importData }),
    ]),
  ]);

  root.append(syncCard(), week, stats, appearance, reminders, months, data);
}

/** Stamps the theme choice on <html>; 'system' clears it so the OS decides. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
