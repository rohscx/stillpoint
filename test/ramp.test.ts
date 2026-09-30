import { describe, expect, it } from 'vitest';
import { applyRamp, rampCostPercent, rampSpeed } from '../src/reader/engine/ramp.js';
import { tokenize } from '../src/reader/engine/tokenize.js';
import { tokenDurationMs } from '../src/reader/engine/timing.js';
import { DEFAULT_COMFORT, READING_COMFORT, type ComfortSettings } from '../src/shared/types.js';
import { migrate } from '../src/shared/settings.js';

const passage = (): ReturnType<typeof tokenize> => tokenize('Done. one two three four five six');

describe('post-sentence ramp golden durations at 350 WPM', () => {
  it.each([
    ['ease-in', { ...READING_COMFORT }, [321.43, 238.51, 221.20, 197.33, 171.43]],
    ['ease-out', { ...READING_COMFORT, rampCurve: 'out' }, [321.43, 206.23, 185.33, 174.70, 171.43]],
    ['linear', { ...READING_COMFORT, rampCurve: 'linear', rampStart: 60, rampWords: 5, blink: false }, [285.71, 252.10, 225.56, 204.08, 186.34]],
  ] satisfies Array<[string, ComfortSettings, number[]]>)('%s matches all five hand-verified durations', (_name, settings, expected) => {
    const tokens = passage();
    const period = tokens[0];
    if (period === undefined) throw new Error('Missing period');
    const normal = tokenDurationMs(period, 350);
    applyRamp(tokens, settings);
    expect(tokenDurationMs(period, 350)).toBe(normal);
    expect(tokens.slice(1, 6).map(token => Number(tokenDurationMs(token, 350).toFixed(2)))).toEqual(expected);
  });
});

it('uses engine sentence ends, including abbreviation exceptions and closing punctuation', () => {
  const tokens = tokenize('Dr. one e.g. two Done.” three four');
  const normal = tokens.map(token => token.delayFactor);
  applyRamp(tokens, READING_COMFORT);
  expect(tokens.slice(0, 5).map(token => token.delayFactor)).toEqual(normal.slice(0, 5));
  expect(tokens[5]?.delayFactor).toBeCloseTo(1 / 0.7);
});

it('never ramps code and a code block interrupts an active ramp', () => {
  const tokens = tokenize([
    { kind: 'text', text: 'Done. one' },
    { kind: 'code', lines: ['Done.', 'next'] },
    { kind: 'text', text: 'two three four' },
  ]);
  const normal = tokens.map(token => tokenDurationMs(token, 350));
  applyRamp(tokens, READING_COMFORT);
  expect(tokens.slice(2).map(token => tokenDurationMs(token, 350))).toEqual(normal.slice(2));
});

it('blink floor follows WPM and normal timing factors independently of the ramp', () => {
  const tokens = tokenize('Done. lengthyword short');
  const first = tokens[1];
  if (first === undefined) throw new Error('Missing word');
  const factor = first.delayFactor;
  applyRamp(tokens, { ...READING_COMFORT, ramp: false });
  for (const wpm of [150, 350, 1000]) expect(tokenDurationMs(first, wpm)).toBeCloseTo(60000 / wpm * factor + 150);
});

it('first-word-only overrides N; ramp and blink can be disabled without compounding or replacing tokens', () => {
  expect(rampSpeed(0, { ...READING_COMFORT, rampCurve: 'first' })).toBe(0.7);
  expect(rampSpeed(1, { ...READING_COMFORT, rampCurve: 'first' })).toBe(1);
  const tokens = passage();
  const identities = [...tokens];
  const normal = tokens.map(token => token.delayFactor);
  applyRamp(tokens, READING_COMFORT);
  const ramped = tokens.map(token => token.delayFactor);
  applyRamp(tokens, READING_COMFORT);
  expect(tokens.map(token => token.delayFactor)).toEqual(ramped);
  applyRamp(tokens, DEFAULT_COMFORT);
  expect(tokens.map(token => token.delayFactor)).toEqual(normal);
  tokens.forEach((token, i) => expect(token).toBe(identities[i]));
});

it('estimates the passage cost including the start floor without mutating tokens', () => {
  const tokens = passage();
  const before = structuredClone(tokens);
  const sum = (list: typeof tokens): number => list.reduce((total, token, i) => total + Math.max(i === 0 ? 400 : 0, tokenDurationMs(token, 350)), 0);
  const derived = structuredClone(tokens);
  applyRamp(derived, READING_COMFORT);
  expect(rampCostPercent(tokens, READING_COMFORT, 350)).toBeCloseTo(100 * (sum(derived) / sum(tokens) - 1));
  expect(tokens).toEqual(before);
  expect(rampCostPercent([], READING_COMFORT, 350)).toBe(0);
  expect(rampCostPercent(tokens, DEFAULT_COMFORT, 350)).toBe(0);
});

it('migrates v3 with new fields off and the recommended shape while retaining old preferences', () => {
  const { ramp: _ramp, rampCurve: _curve, rampStart: _start, rampWords: _words, blink: _blink, blinkMs: _ms, ...previousPreset } = READING_COMFORT;
  const result = migrate({ version: 3, comfort: previousPreset });
  expect(result.version).toBe(4);
  expect(result.comfort).toEqual({ ...DEFAULT_COMFORT, ...previousPreset });
});

it.each([null, [], 'bad', Infinity, NaN, {}, { ramp: 'yes', blink: 1, rampCurve: 'bad', rampStart: -Infinity, rampWords: NaN, blinkMs: Infinity }])('defaults malformed new settings: %j', comfort => {
  expect(migrate({ version: 4, comfort }).comfort).toEqual(DEFAULT_COMFORT);
});

it('bounds every new number and makes the word count integral', () => {
  expect(migrate({ version: 4, comfort: { rampStart: -100, rampWords: 100, blinkMs: -1 } }).comfort)
    .toMatchObject({ rampStart: 40, rampWords: 8, blinkMs: 0 });
  expect(migrate({ version: 4, comfort: { rampStart: 200, rampWords: -1, blinkMs: 1e200 } }).comfort)
    .toMatchObject({ rampStart: 100, rampWords: 1, blinkMs: 1000 });
  expect(migrate({ version: 4, comfort: { rampWords: 3.9 } }).comfort.rampWords).toBe(3);
});
