import { describe, expect, it } from 'vitest';
import { loadSettings, migrate, saveSettings, type SettingsStorageArea } from '../src/shared/settings.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types.js';

function expectValid(settings: Settings): void {
  expect(settings.version).toBe(3);
  expect(settings.wpm).toBeGreaterThanOrEqual(150);
  expect(settings.wpm).toBeLessThanOrEqual(1_000);
  expect([20, 28, 36, 48]).toContain(settings.fontSize);
  expect(['auto', 'light', 'dark']).toContain(settings.theme);
  expect(Number.isFinite(settings.maxWordLen)).toBe(true);
  expect(settings.position === null || (
    Number.isFinite(settings.position.x) && Number.isFinite(settings.position.y)
  )).toBe(true);
  for (const factor of Object.values(settings.factors)) expect(Number.isFinite(factor)).toBe(true);
  expect(typeof settings.autoRewindOnResume).toBe('boolean');
  expect(typeof settings.hideControlsWhilePlaying).toBe('boolean');
}

describe('migrate', () => {
  it.each([undefined, null, {}])('deep-merges defaults for %p', (raw) => {
    const settings = migrate(raw);
    expectValid(settings);
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('fills nested factors missing from a v0-shaped object', () => {
    const settings = migrate({ version: 0, wpm: 425, theme: 'dark' });
    expectValid(settings);
    expect(settings.wpm).toBe(425);
    expect(settings.theme).toBe('dark');
    expect(settings.factors).toEqual(DEFAULT_SETTINGS.factors);
  });

  it('defaults a v1.0 settings object without position to null', () => {
    const settings = migrate({
      version: 2,
      wpm: 425,
      fontSize: 36,
      theme: 'auto',
      maxWordLen: 18,
      factors: DEFAULT_SETTINGS.factors,
      autoRewindOnResume: true,
      hideControlsWhilePlaying: true,
    });
    expect(settings.position).toBeNull();
  });

  it('defaults codeLine for settings written before v1.2', () => {
    const { codeLine: _codeLine, ...v11Factors } = DEFAULT_SETTINGS.factors;
    const settings = migrate({
      version: 2,
      wpm: 350,
      fontSize: 36,
      theme: 'auto',
      maxWordLen: 18,
      factors: v11Factors,
      position: null,
      autoRewindOnResume: true,
      hideControlsWhilePlaying: true,
    });
    expect(settings.factors.codeLine).toBe(1);
  });

  it('sanitizes an unknown future version', () => {
    const settings = migrate({ version: 99, wpm: 500, factors: { sentence: 3 } });
    expectValid(settings);
    expect(settings.version).toBe(3);
    expect(settings.wpm).toBe(500);
    expect(settings.factors.sentence).toBe(3);
    expect(settings.factors.clause).toBe(DEFAULT_SETTINGS.factors.clause);
  });

  it('replaces wrong-typed values', () => {
    const settings = migrate({ wpm: 'fast', fontSize: 'large', factors: { numeric: 'slow' } });
    expectValid(settings);
    expect(settings.wpm).toBe(DEFAULT_SETTINGS.wpm);
    expect(settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(settings.factors.numeric).toBe(DEFAULT_SETTINGS.factors.numeric);
  });

  it.each([[100, 150], [1_500, 1_000]])('clamps WPM %i to %i', (raw, expected) => {
    const settings = migrate({ wpm: raw });
    expectValid(settings);
    expect(settings.wpm).toBe(expected);
  });

  it('clamps font sizes to the nearest allowed value', () => {
    expect(migrate({ fontSize: 21 }).fontSize).toBe(20);
    expect(migrate({ fontSize: 31 }).fontSize).toBe(28);
    expect(migrate({ fontSize: 100 }).fontSize).toBe(48);
  });
});

describe('settings storage', () => {
  it('round-trips the reader-facing fields through the shared settings object', async () => {
    let stored: Record<string, unknown> = {};
    const storage: SettingsStorageArea = {
      get: async () => stored,
      set: async (items) => { stored = items; },
    };

    const saved = await saveSettings({
      ...DEFAULT_SETTINGS,
      wpm: 615,
      theme: 'dark',
      fontSize: 48,
      position: { x: 72.5, y: 24 },
    }, storage);
    expect(saved).toMatchObject({
      wpm: 615,
      theme: 'dark',
      fontSize: 48,
      position: { x: 72.5, y: 24 },
    });
    await expect(loadSettings(storage)).resolves.toEqual(saved);
  });
});

it('upgrades a v1 settings object off the old 13-glyph word limit', () => {
  // maxWordLen was never exposed in any UI, so a stored 13 can only be the v1 default —
  // the one that split 'infrastructure' into 'infrast-' and 'ructure'.
  const upgraded = migrate({ version: 1, wpm: 400, maxWordLen: 13 });
  expect(upgraded.maxWordLen).toBe(DEFAULT_SETTINGS.maxWordLen);
  expect(upgraded.version).toBe(3);
  expect(upgraded.wpm).toBe(400);
});

it('respects a deliberate maxWordLen once the object is v2', () => {
  expect(migrate({ version: 2, maxWordLen: 11 }).maxWordLen).toBe(11);
});
