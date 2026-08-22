/* The timer, kept outside the view so it survives navigation.

   It stores the moment it should finish rather than counting seconds down, so
   the reading stays right even when the browser throttles background tabs or
   the phone sleeps — on return it recomputes from the clock instead of having
   quietly lost time. */

const DEFAULT_MINUTES = 10;

class Countdown extends EventTarget {
  constructor() {
    super();
    this.minutes = DEFAULT_MINUTES;
    this.durationMs = DEFAULT_MINUTES * 60_000;
    this.endsAt = null;
    this.pausedRemaining = this.durationMs;
    this.finished = false;
  }

  get running() {
    return this.endsAt !== null;
  }

  get remainingMs() {
    if (!this.running) return this.pausedRemaining;
    return Math.max(0, this.endsAt - Date.now());
  }

  get remainingSeconds() {
    return Math.ceil(this.remainingMs / 1000);
  }

  /** 0–1, for the ring. */
  get progress() {
    if (!this.durationMs) return 0;
    return (this.durationMs - this.remainingMs) / this.durationMs;
  }

  setMinutes(minutes) {
    this.minutes = minutes;
    this.durationMs = minutes * 60_000;
    this.endsAt = null;
    this.pausedRemaining = this.durationMs;
    this.finished = false;
    this.emit();
  }

  start() {
    if (this.running) return;
    this.finished = false;
    this.endsAt = Date.now() + this.pausedRemaining;
    this.emit();
  }

  pause() {
    if (!this.running) return;
    this.pausedRemaining = this.remainingMs;
    this.endsAt = null;
    this.emit();
  }

  reset() {
    this.endsAt = null;
    this.pausedRemaining = this.durationMs;
    this.finished = false;
    this.emit();
  }

  /** Called by the app's global tick; fires 'done' once when time runs out. */
  tick() {
    if (this.running && this.remainingMs <= 0) {
      this.endsAt = null;
      this.pausedRemaining = this.durationMs;
      this.finished = true;
      this.dispatchEvent(new CustomEvent('done'));
    }
    if (this.running || this.finished) this.emit();
  }

  emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

export const timer = new Countdown();

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
