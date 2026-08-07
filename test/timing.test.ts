import { describe, expect, it } from 'vitest';

import type { Token } from '../src/shared/types.js';
import { computeDelayFactor, tokenDurationMs } from '../src/reader/engine/timing.js';

describe('timing factors', () => {
  it.each([
    ['baseline', 'word', {}, 1],
    ['sentence', 'word.', {}, 2.5],
    ['clause', 'word,', {}, 1.8],
    ['paragraph end', 'word', { endsParagraph: true }, 1.4],
    ['long word', 'abcdefghi', {}, 1.05],
    ['numeric', 'word2', {}, 1.4],
    ['paragraph start', 'word', { startsParagraph: true }, 1.2],
  ] as const)('applies %s independently', (_name, text, context, expected) => {
    expect(computeDelayFactor(text, {}, context)).toBeCloseTo(expected);
  });

  it('composes sentence, paragraph-end, and numeric factors', () => {
    expect(computeDelayFactor('Ch2.', {}, { endsParagraph: true })).toBeCloseTo(2.5 * 1.4 * 1.4);
  });

  it('composes the long-word factor on top of the others', () => {
    // 'Chapter2.' is 9 glyphs, so the long-word factor applies as well.
    expect(computeDelayFactor('Chapter2.', {}, { endsParagraph: true }))
      .toBeCloseTo(2.5 * 1.4 * 1.4 * 1.05);
  });

  it('composes clause, long-word, and paragraph-start factors', () => {
    expect(computeDelayFactor('something,', {}, { startsParagraph: true })).toBeCloseTo(1.8 * 1.1 * 1.2);
  });

  it('caps the long-word multiplier at 1.5', () => {
    expect(computeDelayFactor('abcdefghijklmnopqr')).toBe(1.5);
    expect(computeDelayFactor('abcdefghijklmnopqr', { longWord: 0.2 })).toBe(1.5);
  });

  it('uses merged setting overrides and converts WPM to milliseconds', () => {
    expect(computeDelayFactor('stop.', { sentence: 3 })).toBe(3);
    const token: Token = {
      text: 'word', orp: 1, delayFactor: 2, sentenceIdx: 0, paraIdx: 0, sourceIdx: 0,
    };
    // 60000/300 = 200ms base, times the token's baked-in delayFactor of 2.
    expect(tokenDurationMs(token, 300)).toBe(400);
    expect(tokenDurationMs({ ...token, delayFactor: 1 }, 300)).toBe(200);
  });

  it('rejects a non-positive WPM', () => {
    const token: Token = {
      text: 'word', orp: 1, delayFactor: 1, sentenceIdx: 0, paraIdx: 0, sourceIdx: 0,
    };
    expect(() => tokenDurationMs(token, 0)).toThrow(RangeError);
  });
});
