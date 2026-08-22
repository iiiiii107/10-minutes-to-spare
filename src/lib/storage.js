/* Storage adapter.

   Everything the app does goes through `storage`, never through localStorage
   directly. `storage` is a facade over one backend at a time: the browser when
   you're signed out, Firestore when you're signed in. Swapping the backend is
   the whole of "turning sync on" — no view code knows which one is underneath. */

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
    // Your own settings for the two tools that only mark up. The pen and the
    // eraser aren't here: the pen takes each task's colour, and the eraser
    // has nothing to set.
    toolStyles: {
      highlighter: { ink: '#EFD87B', width: 15 },
      crayon: { ink: '#B8714C', width: 5.5 },
    },
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
  padMarks: {},
  torn: {},
  archive: [],
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Fills in anything a stored payload predates, so old saves keep working. */
export function withDefaults(data) {
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
  settings.toolStyles = {
    ...DEFAULT_STATE.settings.toolStyles,
    ...(settings.toolStyles || {}),
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

/* The facade.

   One backend is live at a time. Subscribers register with the facade rather
   than with a backend, so they survive a swap: signing in replaces what's
   underneath and everyone is handed the cloud's copy of the state. */

const local = createLocalStorage();
let backend = local;
const listeners = new Set();
let detach = backend.subscribe((state) => listeners.forEach((fn) => fn(state)));

export const storage = {
  get kind() {
    return backend.kind;
  },
  load: (...args) => backend.load(...args),
  save: (...args) => backend.save(...args),
  exportAll: () => backend.exportAll(),
  importAll: (json) => backend.importAll(json),

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** The signed-out backend, for seeding the cloud on first sign-in. */
  local,

  /**
   * Put a different backend underneath and hand everyone its state.
   * @param {object} next a backend, or null to go back to this browser only
   */
  async use(next) {
    const chosen = next || local;
    if (chosen === backend) return backend.load();

    detach?.();
    backend = chosen;
    detach = backend.subscribe((state) => listeners.forEach((fn) => fn(state)));

    const state = await backend.load();
    listeners.forEach((fn) => fn(state));
    return state;
  },
};
