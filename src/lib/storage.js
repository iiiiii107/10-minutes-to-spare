/* Storage adapter.

   Everything the app does goes through `storage`, never through localStorage
   directly. Today that's backed by the browser; when the Firebase project
   exists, `createFirebaseStorage()` slots in behind the same four methods and
   no view code changes. */

const KEY = '10mts:data:v1';

export const DEFAULT_STATE = {
  settings: {
    weekStartsMonday: true,
    notificationsEnabled: false,
    theme: 'system',
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
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Fills in anything a stored payload predates, so old saves keep working. */
function withDefaults(data) {
  return {
    ...DEFAULT_STATE,
    ...data,
    settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
    monthColors: undefined,
  };
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
