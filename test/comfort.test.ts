import { describe, expect, it } from 'vitest';
import { ComfortPulse, comfortColor, comfortDrift } from '../src/reader/engine/comfort.js';
import { DEFAULT_COMFORT, DEFAULT_SETTINGS, READING_COMFORT, type WordToken } from '../src/shared/types.js';
import { loadSettings, migrate, saveSettings } from '../src/shared/settings.js';
import { mergeSettings } from '../src/reader/engine/timing.js';

const word = (text: string): WordToken => ({ kind: 'word', text, orp: 0, delayFactor: 1, sentenceIdx: 0, paraIdx: 0, sourceIdx: 0 });

describe('reading comfort', () => {
  it('migrates v2 to shipped defaults, preserving existing preferences', () => {
    const { comfort: _comfort, ...v2 } = DEFAULT_SETTINGS;
    const next = migrate({ ...v2, version: 2, wpm: 425, maxWordLen: 11 });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, wpm: 425, maxWordLen: 11 });
    expect(next.comfort).not.toBe(DEFAULT_COMFORT);
  });

  it('deep-merges and sanitizes partial comfort blocks without changing defaults', () => {
    expect(mergeSettings({ comfort: { saturation: 25 } }).comfort).toEqual({ ...DEFAULT_COMFORT, saturation: 25 });
    expect(migrate({ version: 3, comfort: { saturation: -10, weight: 900, hue: 'yes', driftMinutes: Infinity, pulseDurationSeconds: 0 } }).comfort)
      .toEqual({ ...DEFAULT_COMFORT, saturation: 0, pulseDurationSeconds: 0.1 });
    expect(migrate({ version: 3, comfort: null }).comfort).toEqual(DEFAULT_COMFORT);
  });

  it('round-trips every preset field', async () => {
    let stored: Record<string, unknown> = {};
    const storage = { get: async () => stored, set: async (value: Record<string, unknown>) => { stored = value; } };
    await saveSettings({ ...DEFAULT_SETTINGS, comfort: READING_COMFORT }, storage);
    expect((await loadSettings(storage)).comfort).toEqual(READING_COMFORT);
  });

  it('fires for sentence ends and long dwell, respecting the minimum start-to-start gap', () => {
    const pulse = new ComfortPulse();
    pulse.trigger(word('word'), 200, 0, READING_COMFORT);
    expect(pulse.until).toBe(0);
    pulse.trigger(word('Done.”'), 250, 100, READING_COMFORT);
    expect(pulse.until).toBe(350);
    pulse.trigger(word('longword'), 500, 1099, READING_COMFORT);
    expect(pulse.until).toBe(350);
    pulse.trigger(word('longword'), 500, 1100, READING_COMFORT);
    expect(pulse.until).toBe(1600);
  });

  it('uses engine sentence semantics, not a punctuation approximation', () => {
    const settings = { ...READING_COMFORT, pulseTrigger: 'sentence' as const, pulseGapSeconds: 0 };
    const pulse = new ComfortPulse();
    for (const text of ['Dr.', 'e.g.', 'word,']) pulse.trigger(word(text), 500, 0, settings);
    expect(pulse.until).toBe(0);
    for (const text of ['Done.”', 'wait…', 'Really?)', 'yes...']) {
      pulse.reset();
      pulse.trigger(word(text), 200, 0, settings);
      expect(pulse.until).toBe(200);
    }
  });

  it('caps a natural pulse by both triggering dwell and duration', () => {
    const pulse = new ComfortPulse();
    pulse.trigger(word('Done.'), 450, 0, READING_COMFORT);
    expect(pulse.until).toBe(450);
    pulse.trigger(word('Done.'), 2000, 1000, READING_COMFORT);
    expect(pulse.until).toBe(2000);
  });

  it('composes baseline, pulse, hue, lightness and neutral precedence exactly as the demo', () => {
    const settings = { ...READING_COMFORT, hue: false };
    expect(comfortColor(DEFAULT_COMFORT, false, 0, 0)).toBe('var(--sp-orp)');
    expect(comfortColor(settings, false, 1000, 500)).toBe('hsl(353 24.5% 41%)');
    expect(comfortColor(settings, true, 1000, 500)).toBe('hsl(0 25% 65%)');
    expect(comfortColor(settings, false, 499, 500)).toBe('hsl(353 75% 41%)');
    expect(comfortColor(settings, false, 500, 500)).toBe('hsl(353 24.5% 41%)');
    expect(comfortColor({ ...settings, pulseLightness: 30 }, true, 0, 500)).toBe('hsl(0 75% 92%)');
    expect(comfortColor({ ...settings, neutral: true }, false, 0, 500)).toBe('var(--sp-fg)');
    expect(comfortColor(READING_COMFORT, false, 7500, 0)).toBe('hsl(363 24.5% 41%)');
  });

  it('supports independent timer pulses and disabled pulses', () => {
    const settings = { ...READING_COMFORT, hue: false, pulseTrigger: 'timer' as const };
    expect(comfortColor(settings, false, 11000, 0)).toBe('hsl(353 75% 41%)');
    expect(comfortColor(settings, false, 12000, 0)).toBe('hsl(353 24.5% 41%)');
    expect(comfortColor({ ...settings, pulse: false }, false, 0, 500)).toBe('hsl(353 24.5% 41%)');
  });

  it('samples continuous elapsed-time drift and unconditionally suppresses reduced motion', () => {
    expect(comfortDrift(READING_COMFORT, 60000, false)).toBe(1);
    expect(comfortDrift(READING_COMFORT, 180000, false)).toBe(-1);
    expect(comfortDrift(READING_COMFORT, 60000, true)).toBe(0);
    expect(comfortDrift(DEFAULT_COMFORT, 60000, false)).toBe(0);
  });
});
