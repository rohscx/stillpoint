import { expect, it } from 'vitest';
import { isStillpointMessage } from '../src/shared/messages.js';
import { migrate } from '../src/shared/settings.js';
import { tokenize, unsupportedScript } from '../src/reader/engine/tokenize.js';
import { tokenDurationMs } from '../src/reader/engine/timing.js';
import { Scheduler } from '../src/reader/engine/scheduler.js';

it('#3 accepts current settings and rejects missing codeLine and unknown versions', () => {
  const settings = migrate(undefined);
  expect(isStillpointMessage({ kind: 'settings-changed', settings })).toBe(true);
  expect(isStillpointMessage({ kind: 'settings-changed', settings: { ...settings, version: 999 } })).toBe(false);
  expect(isStillpointMessage({ kind: 'settings-changed', settings: { ...settings, factors: { ...settings.factors, codeLine: undefined } } })).toBe(false);
});

it('#2 processes 24,000 seam glyphs within one second', () => {
  const start = performance.now();
  const tokens = tokenize('a/'.repeat(12_000));
  expect(performance.now() - start).toBeLessThan(1_000);
  expect(tokens.map((token) => token.text).join('')).toBe('a/'.repeat(12_000));
});

it('#2 rejects absurd tokens within one second', () => {
  const start = performance.now();
  expect(() => tokenize('a/'.repeat(100_000))).toThrow(RangeError);
  expect(performance.now() - start).toBeLessThan(1_000);
});

it('#9 leaves at least three letters on each side of a mid-word break', () => {
  const tokens = tokenize('a'.repeat(18) + '-' + 'b'.repeat(28) + ')');
  for (const token of tokens) {
    for (const run of token.text.match(/[ab]+/gu) ?? []) expect(run.length).toBeGreaterThanOrEqual(3);
  }
});

it('#13 bounds migrated factors and composed durations', () => {
  for (const value of [1e308, Number.MIN_VALUE, Infinity, -1, NaN]) {
    const factors = Object.fromEntries(Object.keys(migrate(undefined).factors).map((key) => [key, value]));
    const settings = migrate({ factors });
    for (const factor of Object.values(settings.factors)) {
      expect(factor).toBeGreaterThanOrEqual(0.01);
      expect(factor).toBeLessThanOrEqual(10);
    }
    const tokens = tokenize([{ kind: 'text', text: '1234567890.' }, { kind: 'code', lines: ['x'.repeat(100_000)] }], settings);
    for (const token of tokens) {
      const duration = tokenDurationMs(token, 150);
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeLessThanOrEqual(2_147_483_647);
    }
  }
});

it('#8 explicit seek cancels pending auto-rewind', () => {
  let now = 0;
  const scheduler = new Scheduler(tokenize('one two three four five six seven eight nine'), {
    clock: { now: () => now, setTimer: () => 0, clearTimer: () => undefined },
  });
  scheduler.play();
  scheduler.pause();
  now = 4_000;
  scheduler.seekWord(5);
  scheduler.play();
  expect(scheduler.index).toBe(5);
});

it('#15 gates each paragraph independently', () => {
  expect(unsupportedScript('English words. '.repeat(100) + '\n\n日本語の文章です。')).toBe('cjk');
});

it('#17 maps NFC split offsets back to the original source', () => {
  const tokens = tokenize('e\u0301'.repeat(25));
  expect(tokens[1]?.sourceIdx).toBe(24);
});

it('#12 passes the context-menu snapshot to the isolated reader', async () => {
  const { vi } = await import('vitest');
  let clicked: ((info: { menuItemId: string; selectionText?: string }, tab: { id: number }) => void) | undefined;
  const executions: Array<{ args?: string[]; files?: string[] }> = [];
  const noop = (): void => undefined;
  vi.stubGlobal('chrome', {
    action: { onClicked: { addListener: noop }, setBadgeText: async () => undefined, setTitle: async () => undefined },
    commands: { onCommand: { addListener: noop } },
    runtime: { onInstalled: { addListener: noop }, onMessage: { addListener: noop } },
    contextMenus: { onClicked: { addListener: (callback: typeof clicked) => { clicked = callback; } } },
    scripting: { executeScript: async (details: typeof executions[number]) => { executions.push(details); } },
  });
  try {
    await import('../src/sw.js');
    clicked?.({ menuItemId: 'stillpoint-read-selection', selectionText: 'iframe selected text' }, { id: 7 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executions[0]?.args).toEqual(['iframe selected text']);
    expect(executions[1]?.files).toEqual(['reader.iife.js']);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('#2 bounds custom planner width and rejects oversized punctuation before planning', () => {
  const start = performance.now();
  expect(() => tokenize('a'.repeat(20_000), { maxWordLen: 10_000 })).toThrow(RangeError);
  expect(() => tokenize('!'.repeat(100_000))).toThrow(RangeError);
  expect(performance.now() - start).toBeLessThan(1_000);
  expect(migrate({ version: 2, maxWordLen: 1e308 }).maxWordLen).toBeLessThanOrEqual(256);
});

it('#13 caps composed code durations at the signed 32-bit timer limit', () => {
  const token = tokenize([{ kind: 'code', lines: ['x'.repeat(100_000)] }], migrate({ factors: { codeLine: 10 } }))[0];
  if (token === undefined) throw new Error('missing token');
  expect(tokenDurationMs(token, 0.000001)).toBe(2_147_483_647);
});
