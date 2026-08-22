import { storage } from './storage.js';
import { reconcile } from './schedule.js';
import { todayISO } from './dates.js';

/* Single source of truth. Views read `store.state`, call an action, and
   re-render on the change event — no view mutates state directly. */

const TASK_COLORS = [
  'var(--task-1)', 'var(--task-2)', 'var(--task-3)',
  'var(--task-4)', 'var(--task-5)', 'var(--task-6)',
];

export const CATEGORY_COLORS = TASK_COLORS;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

class Store extends EventTarget {
  constructor() {
    super();
    this.state = null;
    this.ready = false;
  }

  async init() {
    this.state = await storage.load();
    this.refreshSchedule({ silent: true });
    this.ready = true;
    // A change from underneath — another tab, another device, or sync being
    // switched on — replaces our copy. Reconcile so the plan matches today.
    storage.subscribe((incoming) => {
      this.state = incoming;
      this.refreshSchedule({ silent: true });
      this.emit();
    });
    this.emit();
  }

  emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }

  async persist() {
    await storage.save(this.state);
    this.emit();
  }

  /** Bring the plan up to date for today. Cheap enough to call on every load. */
  refreshSchedule({ silent = false } = {}) {
    const { instances, changed } = reconcile(
      this.state.tasks,
      this.state.instances,
      todayISO(),
      this.state.settings,
    );
    this.state.instances = instances;
    if (changed && !silent) this.persist();
    return changed;
  }

  // ---- categories -------------------------------------------------------

  addCategory({ name, emoji = '📁', color = CATEGORY_COLORS[0] }) {
    this.state.categories.push({
      id: uid(),
      name: name.trim(),
      emoji,
      color,
      createdAt: new Date().toISOString(),
    });
    return this.persist();
  }

  updateCategory(id, patch) {
    const cat = this.state.categories.find((c) => c.id === id);
    if (cat) Object.assign(cat, patch);
    return this.persist();
  }

  /** Removes the category, its tasks, and any instances pointing at them. */
  deleteCategory(id) {
    const taskIds = new Set(
      this.state.tasks.filter((t) => t.categoryId === id).map((t) => t.id),
    );
    this.state.categories = this.state.categories.filter((c) => c.id !== id);
    this.state.tasks = this.state.tasks.filter((t) => t.categoryId !== id);
    this.state.instances = this.state.instances.filter(
      (i) => !taskIds.has(i.taskId),
    );
    return this.persist();
  }

  // ---- tasks ------------------------------------------------------------

  addTask({ categoryId, name, count = 2, period = 'week', color }) {
    const category = this.state.categories.find((c) => c.id === categoryId);
    this.state.tasks.push({
      id: uid(),
      categoryId,
      name: name.trim(),
      count: Number(count),
      period,
      color: color || category?.color || TASK_COLORS[0],
      active: true,
      createdAt: new Date().toISOString(),
    });
    this.refreshSchedule({ silent: true });
    return this.persist();
  }

  updateTask(id, patch) {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) return this.persist();

    const frequencyChanged =
      (patch.count != null && patch.count !== task.count) ||
      (patch.period != null && patch.period !== task.period);
    Object.assign(task, patch);

    if (frequencyChanged) {
      // Drop untouched future instances so the new rhythm takes effect,
      // but never disturb today or anything already done.
      const today = todayISO();
      this.state.instances = this.state.instances.filter(
        (i) =>
          i.taskId !== id || i.status === 'complete' || i.scheduledDate <= today,
      );
      this.refreshSchedule({ silent: true });
    }
    return this.persist();
  }

  /**
   * Put a task on today's list even if its rhythm doesn't call for it today.
   * Used by the quick-add button, so a task you just thought of is actionable
   * straight away rather than waiting for its next slot.
   */
  scheduleForToday(taskId) {
    const today = todayISO();
    const already = this.state.instances.some(
      (i) => i.taskId === taskId && i.scheduledDate === today,
    );
    if (!already) {
      const key = `${taskId}|manual|${today}`;
      this.state.instances.push({
        id: key,
        key,
        taskId,
        scheduledDate: today,
        originalDueDate: today,
        status: 'incomplete',
        completedAt: null,
      });
    }
    return this.persist();
  }

  deleteTask(id) {
    this.state.tasks = this.state.tasks.filter((t) => t.id !== id);
    this.state.instances = this.state.instances.filter((i) => i.taskId !== id);
    return this.persist();
  }

  // ---- pausing -----------------------------------------------------------

  /**
   * Put tasks aside until a date — for a holiday, or a week the plants don't
   * need watering. Paused tasks stop being scheduled and their outstanding
   * plans are cleared, so nothing piles up while you're away. Completed
   * instances are history and stay untouched.
   * @param {string[]} taskIds
   * @param {string|null} resumeOn 'YYYY-MM-DD', or null to un-pause
   */
  pauseTasks(taskIds, resumeOn) {
    const ids = new Set(taskIds);
    const today = todayISO();

    for (const task of this.state.tasks) {
      if (ids.has(task.id)) task.pausedUntil = resumeOn;
    }

    if (resumeOn) {
      this.state.instances = this.state.instances.filter(
        (i) =>
          !ids.has(i.taskId) ||
          i.status === 'complete' ||
          i.scheduledDate < today,
      );
    }

    this.refreshSchedule({ silent: true });
    return this.persist();
  }

  resumeTasks(taskIds) {
    return this.pauseTasks(taskIds, null);
  }

  /** Tasks currently on hold, given today's date. */
  pausedTasks(today = todayISO()) {
    return this.state.tasks.filter((t) => t.pausedUntil && t.pausedUntil > today);
  }

  // ---- ordering ----------------------------------------------------------

  /** Move a task within its list. Order is the array's own order. */
  moveTask(id, direction) {
    const task = this.taskById(id);
    if (!task) return this.persist();

    const siblings = this.tasksInCategory(task.categoryId);
    const at = siblings.indexOf(task);
    const to = at + direction;
    if (to < 0 || to >= siblings.length) return this.persist();

    const a = this.state.tasks.indexOf(siblings[at]);
    const b = this.state.tasks.indexOf(siblings[to]);
    [this.state.tasks[a], this.state.tasks[b]] = [this.state.tasks[b], this.state.tasks[a]];
    return this.persist();
  }

  moveCategory(id, direction) {
    const at = this.state.categories.findIndex((c) => c.id === id);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= this.state.categories.length) return this.persist();

    const list = this.state.categories;
    [list[at], list[to]] = [list[to], list[at]];
    return this.persist();
  }

  // ---- marks -------------------------------------------------------------

  /**
   * Marks drawn on a task. The task row is the canvas, so a mark belongs to
   * that one task and is kept with it — highlighter and crayon marks are
   * still there when you come back.
   */
  addMark(instanceId, mark) {
    const inst = this.state.instances.find((i) => i.id === instanceId);
    if (!inst) return this.persist();
    if (!inst.marks) inst.marks = [];
    inst.marks.push(mark);
    return this.persist();
  }

  clearMarks(instanceId) {
    const inst = this.state.instances.find((i) => i.id === instanceId);
    if (inst) delete inst.marks;
    return this.persist();
  }

  // ---- torn pages --------------------------------------------------------

  /** Days, weeks and months already torn off, so they aren't offered twice. */
  isTorn(kind, key) {
    return Boolean(this.state.torn?.[`${kind}:${key}`]);
  }

  /** Tearing files the page in the archive; the stats are untouched. */
  tearOff(kind, key, page) {
    if (!this.state.torn) this.state.torn = {};
    this.state.torn[`${kind}:${key}`] = new Date().toISOString();

    if (page) {
      if (!this.state.archive) this.state.archive = [];
      // Re-tearing a restored page replaces its entry rather than doubling it.
      const at = this.state.archive.findIndex((p) => p.kind === kind && p.key === key);
      const entry = { ...page, tornAt: new Date().toISOString() };
      if (at >= 0) this.state.archive[at] = entry;
      else this.state.archive.unshift(entry);
    }
    return this.persist();
  }

  /** A page comes back when there's work on it again. */
  untear(kind, key) {
    if (this.state.torn) delete this.state.torn[`${kind}:${key}`];
    return this.persist();
  }

  archivedPages() {
    return this.state.archive || [];
  }

  // ---- stickers ----------------------------------------------------------

  /** Stickers are yours to place; nothing is pinned to the pad automatically. */
  stickersFor(date) {
    return this.state.stickers?.[date] || [];
  }

  addSticker(date, sticker) {
    if (!this.state.stickers) this.state.stickers = {};
    if (!this.state.stickers[date]) this.state.stickers[date] = [];
    this.state.stickers[date].push({
      id: uid(),
      x: 14,
      y: 14 + this.state.stickers[date].length * 32,
      ...sticker,
    });
    return this.persist();
  }

  moveSticker(date, id, x, y) {
    const sticker = this.state.stickers?.[date]?.find((s) => s.id === id);
    if (sticker) Object.assign(sticker, { x, y });
    return this.persist();
  }

  removeSticker(date, id) {
    if (!this.state.stickers?.[date]) return this.persist();
    this.state.stickers[date] = this.state.stickers[date].filter((s) => s.id !== id);
    return this.persist();
  }

  // ---- marks on the notepad ---------------------------------------------

  /** Anything drawn on the pad, kept per day alongside that day's notes. */
  padMarks(date) {
    return this.state.padMarks?.[date] || [];
  }

  addPadMarks(date, marks) {
    if (!marks.length) return this.persist();
    if (!this.state.padMarks) this.state.padMarks = {};
    if (!this.state.padMarks[date]) this.state.padMarks[date] = [];
    this.state.padMarks[date].push(...marks);
    return this.persist();
  }

  clearPadMarks(date) {
    if (this.state.padMarks) delete this.state.padMarks[date];
    return this.persist();
  }

  /** One pass of the eraser: whatever it went over, gone in a single save. */
  eraseFromPad(date, { stickerIds = [], clearMarks = false } = {}) {
    if (stickerIds.length && this.state.stickers?.[date]) {
      const gone = new Set(stickerIds);
      this.state.stickers[date] = this.state.stickers[date].filter((s) => !gone.has(s.id));
    }
    if (clearMarks && this.state.padMarks) delete this.state.padMarks[date];
    return this.persist();
  }

  // ---- calendar ----------------------------------------------------------

  /** Which events we've written, so ones we no longer want can be taken back
      out. Keyed by event id, valued by the date it was written for. */
  setCalendarEvents(map) {
    this.state.calendarEvents = map;
    return this.persist();
  }

  // ---- completion -------------------------------------------------------

  setInstanceStatus(instanceId, status) {
    const inst = this.state.instances.find((i) => i.id === instanceId);
    if (!inst) return this.persist();
    inst.status = status;
    inst.completedAt = status === 'complete' ? new Date().toISOString() : null;
    return this.persist();
  }

  toggleInstance(instanceId) {
    const inst = this.state.instances.find((i) => i.id === instanceId);
    if (!inst) return this.persist();
    return this.setInstanceStatus(
      instanceId,
      inst.status === 'complete' ? 'incomplete' : 'complete',
    );
  }

  // ---- notes ------------------------------------------------------------

  setNote(date, text) {
    this.state.notes[date] = text;
    return this.persist();
  }

  // ---- settings ---------------------------------------------------------

  updateSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.refreshSchedule({ silent: true });
    return this.persist();
  }

  // ---- lookups ----------------------------------------------------------

  taskById(id) {
    return this.state.tasks.find((t) => t.id === id);
  }

  categoryById(id) {
    return this.state.categories.find((c) => c.id === id);
  }

  tasksInCategory(id) {
    return this.state.tasks.filter((t) => t.categoryId === id);
  }
}

export const store = new Store();
export { TASK_COLORS };
