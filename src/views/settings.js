import { clear, el, toast } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { storage } from '../lib/storage.js';

/* Week start, month colours, notifications, theme, and a manual backup route
   that works today whether or not cloud sync is switched on. */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

  return el('div', { class: 'row-between', style: 'padding:10px 0' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:700; font-size:14px', text: label }),
      description ? el('div', { class: 'muted', text: description }) : null,
    ]),
    button,
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
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function monthColorGrid() {
  const grid = el('div', { class: 'grid-2', style: 'gap:10px' });

  MONTHS.forEach((name, index) => {
    const month = index + 1;
    const input = el('input', {
      type: 'color',
      value: store.state.settings.monthColors[month],
      'aria-label': `${name} colour`,
      style: 'width:38px; height:30px; border:none; background:none; padding:0; cursor:pointer',
      onInput: (event) => {
        store.state.settings.monthColors[month] = event.target.value;
      },
      onChange: () => store.updateSettings({}),
    });

    grid.append(
      el('div', { class: 'row', style: 'gap:10px' }, [
        input,
        el('span', { style: 'font-size:13px; font-weight:600', text: name }),
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

export function renderSettings(root) {
  clear(root);
  const { settings } = store.state;

  const general = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [el('h2', { text: 'Settings' })]),

    toggleRow(
      'Week starts on Monday',
      settings.weekStartsMonday !== false,
      (value) => store.updateSettings({ weekStartsMonday: value }),
      'Turn off for weeks that start on Sunday.',
    ),

    toggleRow(
      'Reminders',
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
      'A nudge when the timer ends, and when tasks are waiting.',
    ),
  ]);

  const theme = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Appearance' }),
      el('span', { class: 'sub', text: 'light, dark, or follow your device' }),
    ]),
    el(
      'div',
      { class: 'preset-row', style: 'justify-content:flex-start' },
      ['system', 'light', 'dark'].map((option) =>
        el('button', {
          class: 'preset',
          text: option,
          'aria-pressed': String((settings.theme || 'system') === option),
          onClick: () => {
            store.updateSettings({ theme: option });
            applyTheme(option);
            renderSettings(root);
          },
        }),
      ),
    ),
  ]);

  const months = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Month colours' }),
      el('span', { class: 'sub', text: 'tints the calendar month by month' }),
    ]),
    monthColorGrid(),
  ]);

  const data = el('div', { class: 'card paper' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Your data' }),
      el('span', { class: 'sub', text: 'saved on this device' }),
    ]),
    el('p', { class: 'muted', style: 'margin-bottom:14px' }, [
      'Everything lives in this browser for now. Export a backup before clearing your browser data, or to move it to another device by hand.',
    ]),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn btn-secondary btn-sm', text: 'Export backup', onClick: exportData }),
      el('button', { class: 'btn btn-secondary btn-sm', text: 'Import backup', onClick: importData }),
    ]),
  ]);

  root.append(general, theme, months, data);
}

/** Stamps the theme choice on <html>; 'system' clears it so the OS decides. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
