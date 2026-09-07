import type { ComfortSettings, Token } from '../../shared/types.js';
import { endsSentence } from './timing.js';

/** Pulse starts are separated by the minimum gap, measured in active reading time. */
export class ComfortPulse {
  until = 0;
  #last = -Infinity;

  reset(): void { this.until = 0; this.#last = -Infinity; }

  trigger(token: Token, dwell: number, elapsed: number, settings: ComfortSettings): void {
    if (!settings.pulse || settings.pulseTrigger === 'timer'
      || elapsed - this.#last < settings.pulseGapSeconds * 1000) return;
    const sentence = token.kind === 'word' && endsSentence(token.text);
    const long = dwell >= settings.pulseDwellMs;
    const wanted = settings.pulseTrigger === 'sentence' ? sentence
      : settings.pulseTrigger === 'long' ? long : sentence || long;
    if (!wanted) return;
    this.#last = elapsed;
    this.until = elapsed + Math.min(dwell, settings.pulseDurationSeconds * 1000);
  }
}

export function comfortColor(settings: ComfortSettings, dark: boolean, elapsed: number, pulseUntil: number): string {
  if (settings.neutral) return 'var(--sp-fg)';
  if (settings.saturation === 100 && !settings.hue && !settings.pulse) return 'var(--sp-orp)';
  const pulsing = settings.pulse && (settings.pulseTrigger === 'timer'
    ? elapsed % (settings.pulseEverySeconds * 1000) < Math.min(settings.pulseDurationSeconds, settings.pulseEverySeconds) * 1000
    : elapsed < pulseUntil);
  // Demo semantics: pulse saturation replaces, rather than multiplies, the baseline.
  const saturation = pulsing ? settings.pulseSaturation : (dark ? 100 : 98) * settings.saturation / 100;
  const lightness = (dark ? 65 : 41) + (pulsing ? settings.pulseLightness : 0);
  const hue = (dark ? 0 : 353) + (settings.hue
    ? settings.hueDegrees * Math.sin(2 * Math.PI * elapsed / (settings.huePeriodSeconds * 1000)) : 0);
  return `hsl(${hue} ${Math.min(100, saturation)}% ${Math.min(92, lightness)}%)`;
}

export function comfortDrift(settings: ComfortSettings, elapsed: number, reducedMotion: boolean): number {
  return settings.drift && !reducedMotion
    ? settings.driftPercent * Math.sin(2 * Math.PI * elapsed / (settings.driftMinutes * 60000)) : 0;
}
