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
    storage.subscribe((incoming) => {
      this.state = incoming;
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

  addTask({ categoryId, name, timesPerWeek = 2, color }) {
    const category = this.state.categories.find((c) => c.id === categoryId);
    this.state.tasks.push({
      id: uid(),
      categoryId,
      name: name.trim(),
      timesPerWeek: Number(timesPerWeek),
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
      patch.timesPerWeek != null && patch.timesPerWeek !== task.timesPerWeek;
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
