import type { Settings, Token } from '../../shared/types.js';
import { ComfortPulse, comfortColor, comfortDrift } from '../engine/comfort.js';
import type { SchedulerClock } from '../engine/scheduler.js';
import { endsSentence } from '../engine/timing.js';

/** Demo clock adapter: blanks add wall time without consuming a word's exposure. */
export class Comfort {
  readonly clock: SchedulerClock;
  readonly nudge: HTMLElement;
  readonly #frame: HTMLElement;
  readonly #motion = matchMedia('(prefers-reduced-motion: reduce)');
  readonly #dark = matchMedia('(prefers-color-scheme: dark)');
  readonly #pulse = new ComfortPulse();
  #settings: Settings;
  #active = 0;
  #started: number | undefined;
  #interval: number | undefined;
  #current: Token | undefined;
  #virtualOffset = 0;
  #blankStart: number | undefined;
  #blankTimer: number | undefined;
  #blankCallback: (() => void) | undefined;
  #jitterStep = 0;
  #lastJitter = 0;
  #lastNudge = 0;
  #jx = 0;
  #jy = 0;

  constructor(frame: HTMLElement, settings: Settings) {
    this.#frame = frame;
    this.#settings = settings;
    this.nudge = frame.ownerDocument.createElement('button');
    this.nudge.className = 'sp-button sp-rest-nudge';
    this.nudge.textContent = 'Time for a look away. Pause for a break, or dismiss this nudge.';
    this.nudge.hidden = true;
    this.nudge.addEventListener('click', () => { this.nudge.hidden = true; });
    this.clock = {
      now: () => (this.#blankStart ?? performance.now()) - this.#virtualOffset,
      setTimer: (callback, delay) => window.setTimeout(() => {
        if (!this.#settings.comfort.microBlank || this.#current?.kind !== 'word' || !endsSentence(this.#current.text)) {
          callback();
          return;
        }
        this.#blankStart = performance.now();
        this.#frame.classList.add('sp-comfort-blank');
        this.#blankCallback = callback;
        this.#blankTimer = window.setTimeout(() => this.#endBlank(true), 24);
      }, delay),
      clearTimer: (handle) => { window.clearTimeout(handle as number); this.#endBlank(false); },
    };
    this.#motion.addEventListener('change', this.#refresh);
    this.#dark.addEventListener('change', this.#refresh);
    this.#refresh();
  }

  get elapsed(): number { return this.#active + (this.#started === undefined ? 0 : performance.now() - this.#started); }

  tick(token: Token, dwell: number): void {
    if (this.#started === undefined) {
      this.#started = performance.now();
      this.#lastNudge = 0;
      this.#startInterval();
    }
    this.#current = token;
    this.#pulse.trigger(token, dwell, this.elapsed, this.#settings.comfort);
    this.#refresh();
  }

  stop(): void {
    this.#active = this.elapsed;
    this.#started = undefined;
    window.clearInterval(this.#interval);
    this.#interval = undefined;
    this.#endBlank(false);
    this.nudge.hidden = true;
  }

  reset(): void {
    this.stop();
    this.#active = 0;
    this.#pulse.reset();
    this.#lastJitter = 0;
    this.#jitterStep = 0;
    this.#jx = this.#jy = 0;
    this.#refresh();
  }

  apply(settings: Settings): void {
    this.#settings = settings;
    if (!settings.comfort.microBlank) this.#endBlank(true);
    if (!settings.comfort.restNudge) this.nudge.hidden = true;
    if (this.#started !== undefined) this.#startInterval();
    this.#refresh();
  }

  destroy(): void {
    this.stop();
    this.#motion.removeEventListener('change', this.#refresh);
    this.#dark.removeEventListener('change', this.#refresh);
  }

  #endBlank(resume: boolean): void {
    window.clearTimeout(this.#blankTimer);
    this.#blankTimer = undefined;
    if (this.#blankStart !== undefined) this.#virtualOffset += performance.now() - this.#blankStart;
    this.#blankStart = undefined;
    this.#frame.classList.remove('sp-comfort-blank');
    const callback = this.#blankCallback;
    this.#blankCallback = undefined;
    if (resume) callback?.();
  }

  #startInterval(): void {
    window.clearInterval(this.#interval);
    this.#interval = undefined;
    const c = this.#settings.comfort;
    // Same timer sampling as the demo; no animation loop and no timer for shipped defaults.
    if (c.hue || c.pulse || c.drift || c.jitter || c.restNudge) {
      this.#interval = window.setInterval(this.#refresh, 33);
    }
  }

  readonly #refresh = (): void => {
    const c = this.#settings.comfort;
    const elapsed = this.elapsed;
    if (!c.jitter || this.#motion.matches) this.#jx = this.#jy = 0;
    else if (this.#started !== undefined && elapsed - this.#lastJitter >= 1000 / 1.5) {
      const phase = this.#jitterStep++ % 4;
      this.#jx = phase === 0 ? 1 : phase === 2 ? -1 : 0;
      this.#jy = phase === 1 ? 1 : phase === 3 ? -1 : 0;
      this.#lastJitter = elapsed;
    }
    const dark = this.#settings.theme === 'dark' || (this.#settings.theme === 'auto' && this.#dark.matches);
    const style = this.#frame.style;
    style.setProperty('--sp-comfort-color', comfortColor(c, dark, elapsed, this.#pulse.until));
    style.setProperty('--sp-orp-stroke', `${c.weight === 800 ? 0.5 : c.weight === 700 ? 0.35 : c.weight === 600 ? 0.2 : 0}px`);
    style.setProperty('--sp-comfort-transform', c.drift || c.jitter
      ? `translate(calc(${comfortDrift(c, elapsed, this.#motion.matches)}% + ${this.#jx}px), ${this.#jy}px)` : 'none');
    if (c.restNudge && this.#started !== undefined) {
      const continuous = performance.now() - this.#started;
      if (continuous - this.#lastNudge >= 300000) {
        this.#lastNudge = continuous;
        this.nudge.hidden = false;
      }
    }
  };
}
