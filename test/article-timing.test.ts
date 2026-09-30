import { expect, it } from 'vitest';
import { articleTiming } from '../src/reader/engine/article-timing.js';
import { applyRamp, rampCostPercent } from '../src/reader/engine/ramp.js';
import { tokenize } from '../src/reader/engine/tokenize.js';
import { tokenDurationMs } from '../src/reader/engine/timing.js';
import { DEFAULT_COMFORT, READING_COMFORT } from '../src/shared/types.js';

it('effective WPM is prose words divided by summed prose durations with every factor', () => {
  const tokens = tokenize([
    { kind: 'text', text: 'Start, lengthyword 123 Done. one two\n\nMore words end.' },
    { kind: 'code', lines: ['const veryLongCodeLine = 123456789;', 'return value;'] },
    { kind: 'text', text: 'Dr. Smith reads. Next word finishes.' },
  ]);
  applyRamp(tokens, READING_COMFORT);
  for (const wpm of [150, 350, 1000]) {
    const durations = tokens.map((token, index) => Math.max(index === 0 ? 400 : 0, tokenDurationMs(token, wpm)));
    const proseWords = tokens.filter(token => token.kind === 'word').length;
    const proseMs = tokens.reduce((sum, token, index) => token.kind === 'word' ? sum + (durations[index] ?? 0) : sum, 0);
    const timing = articleTiming(tokens, wpm);
    expect(timing.proseWords).toBe(proseWords);
    expect(timing.proseMs).toBeCloseTo(proseMs);
    expect(timing.effectiveWpm).toBeCloseTo(proseWords * 60000 / proseMs);
    expect(timing.totalMs).toBeCloseTo(durations.reduce((sum, ms) => sum + ms, 0));
    expect(timing.totalMs).toBeGreaterThan(timing.proseMs);
    for (let index = 0; index <= tokens.length; index++) {
      expect(timing.remainingMs[index]).toBeCloseTo(durations.slice(index).reduce((sum, ms) => sum + ms, 0));
      if (index < tokens.length) expect(timing.wordsThrough[index]).toBe(tokens.slice(0, index + 1).filter(token => token.kind === 'word').length);
    }
    const baseline = tokens.map(token => ({ ...token }));
    applyRamp(baseline, DEFAULT_COMFORT);
    expect(rampCostPercent(tokens, READING_COMFORT, wpm)).toBeCloseTo(100 * (timing.totalMs / articleTiming(baseline, wpm).totalMs - 1));
  }
});

it('includes the article start floor in prose timing but never attributes code time to prose', () => {
  const prose = tokenize('one two three');
  const expected = 400 + prose.slice(1).reduce((sum, token) => sum + tokenDurationMs(token, 350), 0);
  expect(articleTiming(prose, 350).proseMs).toBeCloseTo(expected);
  const mixed = tokenize([{ kind: 'code', lines: ['x'] }, { kind: 'text', text: 'one two three' }]);
  expect(articleTiming(mixed, 350).proseMs).toBeCloseTo(mixed.slice(1).reduce((sum, token) => sum + tokenDurationMs(token, 350), 0));
});

it('returns finite zero effective WPM for empty and code-only articles', () => {
  expect(articleTiming([], 350)).toEqual({ totalMs: 0, proseMs: 0, proseWords: 0, effectiveWpm: 0, remainingMs: [0], wordsThrough: [] });
  const timing = articleTiming(tokenize([{ kind: 'code', lines: ['x', 'y'] }]), 350);
  expect(timing.effectiveWpm).toBe(0);
  expect(timing.proseMs).toBe(0);
  expect(timing.proseWords).toBe(0);
  expect(timing.totalMs).toBeGreaterThan(0);
});
