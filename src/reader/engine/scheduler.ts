import type { Settings, SettingsOverrides, Token } from '../../shared/types.js';
import { mergeSettings, tokenDurationMs } from './timing.js';

export type PauseReason = 'manual' | 'stalled';
export type SchedulerEvent = 'tick' | 'paused' | 'finished';
export type TimerHandle = unknown;

export interface SchedulerClock {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
}

export interface SchedulerOptions {
  settings?: SettingsOverrides;
  clock?: Partial<SchedulerClock>;
}

type TickListener = (token: Token, index: number) => void;
type PausedListener = (reason: PauseReason) => void;
type FinishedListener = () => void;

interface RuntimeGlobals {
  performance: { now: () => number };
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

function runtimeGlobals(): RuntimeGlobals {
  return globalThis as unknown as RuntimeGlobals;
}

function defaultClock(): SchedulerClock {
  const runtime = runtimeGlobals();
  return {
    now: () => runtime.performance.now(),
    setTimer: (callback, delayMs) => runtime.setTimeout(callback, delayMs),
    clearTimer: (handle) => runtime.clearTimeout(handle),
  };
}

export class Scheduler {
  readonly #tokens: readonly Token[];
  readonly #clock: SchedulerClock;
  readonly #tickListeners = new Set<TickListener>();
  readonly #pausedListeners = new Set<PausedListener>();
  readonly #finishedListeners = new Set<FinishedListener>();
  #settings: Settings;
  #cursor = 0;
  #lastDisplayedIndex = -1;
  #playing = false;
  #timer: TimerHandle | undefined;
  #nextDeadline = 0;
  #pausedAt: number | undefined;

  constructor(tokens: readonly Token[], options: SchedulerOptions = {}) {
    this.#tokens = tokens;
    this.#settings = mergeSettings(options.settings);
    const defaults = defaultClock();
    this.#clock = {
      now: options.clock?.now ?? defaults.now,
      setTimer: options.clock?.setTimer ?? defaults.setTimer,
      clearTimer: options.clock?.clearTimer ?? defaults.clearTimer,
    };
  }

  get isPlaying(): boolean {
    return this.#playing;
  }

  get wpm(): number {
    return this.#settings.wpm;
  }

  get index(): number {
    return this.#lastDisplayedIndex >= 0 ? this.#lastDisplayedIndex : this.#cursor;
  }

  on(event: 'tick', listener: TickListener): () => void;
  on(event: 'paused', listener: PausedListener): () => void;
  on(event: 'finished', listener: FinishedListener): () => void;
  on(event: SchedulerEvent, listener: TickListener | PausedListener | FinishedListener): () => void {
    const listeners = event === 'tick'
      ? this.#tickListeners
      : event === 'paused'
        ? this.#pausedListeners
        : this.#finishedListeners;
    listeners.add(listener as never);
    return () => listeners.delete(listener as never);
  }

  play(): void {
    if (this.#playing) return;
    const now = this.#clock.now();
    if (
      this.#pausedAt !== undefined
      && now - this.#pausedAt > 3_000
      && this.#settings.autoRewindOnResume
    ) {
      this.#cursor = Math.max(0, this.#cursor - 3);
    }
    this.#pausedAt = undefined;
    if (this.#cursor >= this.#tokens.length) this.#cursor = 0;
    if (this.#tokens.length === 0) {
      this.#emitFinished();
      return;
    }
    this.#playing = true;
    this.#displayAndSchedule(true);
  }

  pause(reason: PauseReason = 'manual'): void {
    if (!this.#playing) return;
    this.#stopTimer();
    this.#playing = false;
    this.#pausedAt = this.#clock.now();
    for (const listener of this.#pausedListeners) listener(reason);
  }

  seekWord(offset: number): void {
    this.#pauseForSeek();
    const origin = this.#lastDisplayedIndex >= 0 ? this.#lastDisplayedIndex : this.#cursor;
    this.#cursor = this.#clampIndex(origin + Math.trunc(offset));
    this.#lastDisplayedIndex = this.#cursor;
  }

  seekSentence(offset: number): void {
    this.#seekGroup('sentenceIdx', offset);
  }

  seekParagraph(offset: number): void {
    this.#seekGroup('paraIdx', offset);
  }

  restart(): void {
    this.#pauseForSeek();
    this.#cursor = 0;
    this.#lastDisplayedIndex = -1;
  }

  rewindSentence(): void {
    this.#pauseForSeek();
    const origin = this.#tokens[this.index];
    if (origin === undefined) {
      this.#cursor = 0;
      return;
    }
    this.#cursor = this.#firstIndexOf('sentenceIdx', origin.sentenceIdx);
    this.#lastDisplayedIndex = this.#cursor;
  }

  // Clamped rather than validated: the UI binds this to a repeatable keyboard step
  // (SPEC §5.2), and holding the key at either end must be a no-op, not a throw.
  setWpm(wpm: number): void {
    if (!Number.isFinite(wpm)) throw new TypeError('wpm must be a finite number');
    this.#settings = { ...this.#settings, wpm: Math.min(1_000, Math.max(150, wpm)) };
  }

  #displayAndSchedule(useStartFloor: boolean): void {
    const token = this.#tokens[this.#cursor];
    if (token === undefined) {
      this.#playing = false;
      this.#emitFinished();
      return;
    }

    const displayedIndex = this.#cursor;
    this.#cursor += 1;
    this.#lastDisplayedIndex = displayedIndex;
    for (const listener of this.#tickListeners) listener(token, displayedIndex);

    const duration = tokenDurationMs(token, this.#settings.wpm);
    const scheduledDuration = useStartFloor ? Math.max(400, duration) : duration;
    this.#nextDeadline = useStartFloor
      ? this.#clock.now() + scheduledDuration
      : this.#nextDeadline + scheduledDuration;
    this.#scheduleTimer();
  }

  #scheduleTimer(): void {
    this.#timer = this.#clock.setTimer(
      () => this.#onTimer(),
      Math.max(0, this.#nextDeadline - this.#clock.now()),
    );
  }

  #onTimer(): void {
    this.#timer = undefined;
    if (!this.#playing) return;
    const now = this.#clock.now();
    const overshoot = now - this.#nextDeadline;
    if (overshoot > 2_000) {
      this.pause('stalled');
      return;
    }
    const baseMs = 60_000 / this.#settings.wpm;
    if (overshoot > baseMs) this.#nextDeadline = now;
    this.#displayAndSchedule(false);
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) {
      this.#clock.clearTimer(this.#timer);
      this.#timer = undefined;
    }
  }

  #pauseForSeek(): void {
    if (this.#playing) this.pause('manual');
  }

  #clampIndex(index: number): number {
    return Math.min(Math.max(index, 0), Math.max(0, this.#tokens.length - 1));
  }

  #seekGroup(key: 'sentenceIdx' | 'paraIdx', offset: number): void {
    this.#pauseForSeek();
    const origin = this.#tokens[this.index];
    if (origin === undefined) return;
    const targetGroup = Math.max(0, origin[key] + Math.trunc(offset));
    this.#cursor = this.#firstIndexOf(key, targetGroup);
    this.#lastDisplayedIndex = this.#cursor;
  }

  #firstIndexOf(key: 'sentenceIdx' | 'paraIdx', value: number): number {
    const found = this.#tokens.findIndex((token) => token[key] >= value);
    return found < 0 ? Math.max(0, this.#tokens.length - 1) : found;
  }

  #emitFinished(): void {
    for (const listener of this.#finishedListeners) listener();
  }
}
