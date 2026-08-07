import type { Token } from '../../shared/types.js';
import { tokenDurationMs } from '../engine/timing.js';

export interface ControlActions {
  previousParagraph: () => void;
  previousWord: () => void;
  togglePlaying: () => void;
  nextWord: () => void;
  nextParagraph: () => void;
  setWpm: (wpm: number) => void;
  openSettings: () => void;
  close: () => void;
}

function button(documentRoot: Document, label: string, text: string, action: () => void): HTMLButtonElement {
  const element = documentRoot.createElement('button');
  element.type = 'button';
  element.className = 'sp-button';
  element.setAttribute('aria-label', label);
  element.textContent = text;
  element.addEventListener('click', action);
  return element;
}

function remainingLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secondsPart = (seconds % 60).toString().padStart(2, '0');
  return `${minutesPart}:${secondsPart}`;
}

export class Controls {
  readonly progressElement: HTMLElement;
  readonly element: HTMLElement;
  readonly #tokens: readonly Token[];
  readonly #progressFill: HTMLElement;
  readonly #status: HTMLElement;
  readonly #playButton: HTMLButtonElement;
  readonly #slider: HTMLInputElement;
  #playing = false;
  #lastStatusUpdate = -Infinity;
  #pendingStatusTimer: number | undefined;
  #pendingIndex = 0;
  #pendingWpm: number;
  #idleTimer: number | undefined;
  #stalled = false;

  constructor(documentRoot: Document, tokens: readonly Token[], wpm: number, actions: ControlActions) {
    this.#tokens = tokens;
    this.#pendingWpm = wpm;
    this.progressElement = documentRoot.createElement('div');
    this.progressElement.className = 'sp-progress';
    this.progressElement.setAttribute('role', 'progressbar');
    this.progressElement.setAttribute('aria-label', 'Reading progress');
    this.#progressFill = documentRoot.createElement('div');
    this.#progressFill.className = 'sp-progress-fill';
    this.progressElement.append(this.#progressFill);

    this.element = documentRoot.createElement('div');
    this.element.className = 'sp-controls';
    this.#status = documentRoot.createElement('div');
    this.#status.className = 'sp-status';

    const transport = documentRoot.createElement('div');
    transport.className = 'sp-transport';
    const previousParagraph = button(documentRoot, 'Previous paragraph', '⏮', actions.previousParagraph);
    const previousWord = button(documentRoot, 'Previous word', '◀', actions.previousWord);
    this.#playButton = button(documentRoot, 'Play', '⏯', actions.togglePlaying);
    const nextWord = button(documentRoot, 'Next word', '▶', actions.nextWord);
    const nextParagraph = button(documentRoot, 'Next paragraph', '⏭', actions.nextParagraph);
    this.#slider = documentRoot.createElement('input');
    this.#slider.className = 'sp-slider';
    this.#slider.type = 'range';
    this.#slider.min = '150';
    this.#slider.max = '1000';
    // Must divide the keyboard's 25 WPM step (SPEC §2.4). A step of 10 cannot represent
    // 375, so the browser would coerce it to 380 and the slider would silently disagree
    // with the engine's actual WPM.
    this.#slider.step = '5';
    this.#slider.value = wpm.toString();
    this.#slider.setAttribute('aria-label', 'Words per minute');
    this.#slider.addEventListener('input', () => actions.setWpm(this.#slider.valueAsNumber));
    const settings = button(documentRoot, 'Settings', '⚙', actions.openSettings);
    const close = button(documentRoot, 'Close reader', '✕', actions.close);
    transport.append(
      previousParagraph,
      previousWord,
      this.#playButton,
      nextWord,
      nextParagraph,
      this.#slider,
      settings,
      close,
    );
    this.element.append(this.#status, transport);

    this.element.addEventListener('pointerenter', () => this.#show());
    this.element.addEventListener('pointermove', () => this.#show());
  }

  update(index: number, wpm: number): void {
    const consumed = this.#tokens.length === 0 ? 0 : Math.min(index + 1, this.#tokens.length);
    const progress = this.#tokens.length === 0 ? 0 : consumed / this.#tokens.length;
    this.#progressFill.style.width = `${progress * 100}%`;
    this.progressElement.setAttribute('aria-valuemin', '0');
    this.progressElement.setAttribute('aria-valuemax', this.#tokens.length.toString());
    this.progressElement.setAttribute('aria-valuenow', consumed.toString());
    this.#slider.value = wpm.toString();

    const now = performance.now();
    this.#pendingIndex = index;
    this.#pendingWpm = wpm;
    if (now - this.#lastStatusUpdate >= 250) {
      if (this.#pendingStatusTimer !== undefined) window.clearTimeout(this.#pendingStatusTimer);
      this.#pendingStatusTimer = undefined;
      this.#writeStatus(index, wpm, now);
      return;
    }
    if (this.#pendingStatusTimer === undefined) {
      const delay = Math.max(0, 250 - (now - this.#lastStatusUpdate));
      this.#pendingStatusTimer = window.setTimeout(() => {
        this.#pendingStatusTimer = undefined;
        this.#writeStatus(this.#pendingIndex, this.#pendingWpm, performance.now());
      }, delay);
    }
  }

  setPlaying(playing: boolean): void {
    this.#playing = playing;
    this.#playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (playing) this.#scheduleIdle();
    else this.#show();
  }

  setStalledPause(stalled: boolean): void {
    this.#stalled = stalled;
    if (this.#pendingStatusTimer !== undefined) window.clearTimeout(this.#pendingStatusTimer);
    this.#pendingStatusTimer = undefined;
    this.#writeStatus(this.#pendingIndex, this.#pendingWpm, performance.now());
  }

  noteActivity(): void {
    this.#show();
  }

  destroy(): void {
    if (this.#pendingStatusTimer !== undefined) window.clearTimeout(this.#pendingStatusTimer);
    if (this.#idleTimer !== undefined) window.clearTimeout(this.#idleTimer);
  }

  #writeStatus(index: number, wpm: number, now: number): void {
    const remaining = this.#tokens
      .slice(Math.max(0, index + 1))
      .reduce((total, token) => total + tokenDurationMs(token, wpm), 0);
    const current = this.#tokens.length === 0 ? 0 : Math.min(index + 1, this.#tokens.length);
    const progress = `${wpm} WPM · ${current} / ${this.#tokens.length} words · ${remainingLabel(remaining)} left`;
    this.#status.textContent = this.#stalled
      ? `Paused: tab was backgrounded · ${progress}`
      : progress;
    this.#lastStatusUpdate = now;
  }

  #show(): void {
    this.element.classList.remove('sp-idle');
    if (this.#idleTimer !== undefined) window.clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.#playing) this.#scheduleIdle();
  }

  #scheduleIdle(): void {
    if (this.#idleTimer !== undefined) window.clearTimeout(this.#idleTimer);
    // SPEC §3.4
    this.#idleTimer = window.setTimeout(() => {
      this.#idleTimer = undefined;
      if (this.#playing) this.element.classList.add('sp-idle');
    }, 1_500);
  }
}
