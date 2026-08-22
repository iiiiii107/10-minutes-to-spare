/* Storage adapter.

   Everything the app does goes through `storage`, never through localStorage
   directly. Today that's backed by the browser; when the Firebase project
   exists, `createFirebaseStorage()` slots in behind the same four methods and
   no view code changes. */

const KEY = '10mts:data:v1';

/** Which stat tiles the Stats page shows. Everything is always counted; these
    only decide what's put on screen. */
export const STAT_KEYS = [
  { id: 'streak', label: 'Current streak' },
  { id: 'longestStreak', label: 'Longest streak' },
  { id: 'thisMonth', label: 'Done this month' },
  { id: 'allTime', label: 'Done all time' },
  { id: 'history', label: 'Last 30 days chart' },
  { id: 'timeReclaimed', label: 'Time reclaimed' },
  { id: 'busiest', label: 'Busiest list' },
];

export const DEFAULT_STATE = {
  settings: {
    weekStartsOn: 1,
    weekdayCap: 5,
    minutesPerTask: 10,
    notificationsEnabled: false,
    theme: 'system',
    statsVisible: Object.fromEntries(STAT_KEYS.map((s) => [s.id, true])),
    monthColors: {
      1: '#7C93B8', 2: '#8FA9C4', 3: '#7E9A70', 4: '#9CB88C',
      5: '#C9C06A', 6: '#EFD87B', 7: '#E8C05F', 8: '#D9B54A',
      9: '#C58E5C', 10: '#B8714C', 11: '#8C6A5A', 12: '#5B7291',
    },
  },
  categories: [],
  tasks: [],
  instances: [],
  notes: {},
  stickers: {},
  doodles: {},
  torn: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Fills in anything a stored payload predates, so old saves keep working. */
function withDefaults(data) {
  const settings = { ...DEFAULT_STATE.settings, ...(data.settings || {}) };

  // Week start used to be a boolean; it's now a day index, so that anyone
  // whose week begins on a Wednesday can say so.
  if (settings.weekStartsOn == null && 'weekStartsMonday' in settings) {
    settings.weekStartsOn = settings.weekStartsMonday === false ? 0 : 1;
  }
  delete settings.weekStartsMonday;

  settings.statsVisible = {
    ...DEFAULT_STATE.settings.statsVisible,
    ...(settings.statsVisible || {}),
  };
  settings.monthColors = {
    ...DEFAULT_STATE.settings.monthColors,
    ...(settings.monthColors || {}),
  };

  // Frequency used to be weeks-only; it now carries its own period.
  const tasks = (data.tasks || []).map((task) =>
    task.count == null
      ? { ...task, count: task.timesPerWeek ?? 1, period: 'week' }
      : task,
  );

  return { ...DEFAULT_STATE, ...data, tasks, settings };
}

export function createLocalStorage() {
  const listeners = new Set();

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? withDefaults(JSON.parse(raw)) : clone(DEFAULT_STATE);
    } catch {
      return clone(DEFAULT_STATE);
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save — storage may be full or blocked.', err);
    }
    listeners.forEach((fn) => fn(state));
  }

  // Another tab saving counts as a remote change; mirror it into this one.
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) listeners.forEach((fn) => fn(read()));
  });

  return {
    kind: 'local',
    load: async () => read(),
    save: async (state) => write(state),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async exportAll() {
      return JSON.stringify(read(), null, 2);
    },
    async importAll(json) {
      write(withDefaults(JSON.parse(json)));
    },
  };
}

export const storage = createLocalStorage();
