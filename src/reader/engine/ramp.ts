import type { ComfortSettings, Token } from '../../shared/types.js';
import { articleTiming } from './article-timing.js';
import { endsSentence } from './timing.js';

// SPEC §3.8
export function rampSpeed(k: number, settings: ComfortSettings): number {
  const n = settings.rampCurve === 'first' ? 1 : settings.rampWords;
  if (!settings.ramp || k >= n) return 1;
  const t = k / n;
  const s = settings.rampStart / 100;
  const f = settings.rampCurve === 'out' ? 1 - (1 - t) ** 2
    : settings.rampCurve === 'in' ? t * t : t;
  return s + (1 - s) * f;
}

// SPEC §3.8: preserve token identities and always derive from normal timing.
export function applyRamp(tokens: readonly Token[], settings: ComfortSettings): void {
  let k = Infinity;
  for (const token of tokens) {
    if (token.kind === 'code') { k = Infinity; continue; }
    token.normalDelayFactor ??= token.delayFactor;
    token.delayFactor = token.normalDelayFactor / rampSpeed(k, settings);
    token.blinkMs = k === 0 && settings.blink ? settings.blinkMs : 0;
    k = endsSentence(token.text) ? 0 : k + 1;
  }
}

export function rampCostPercent(tokens: readonly Token[], settings: ComfortSettings, wpm: number): number {
  const derived = tokens.map(token => ({ ...token }));
  applyRamp(derived, settings);
  const ramped = articleTiming(derived, wpm).totalMs;
  applyRamp(derived, { ...settings, ramp: false, blink: false });
  const normal = articleTiming(derived, wpm).totalMs;
  return normal === 0 ? 0 : 100 * (ramped / normal - 1);
}
