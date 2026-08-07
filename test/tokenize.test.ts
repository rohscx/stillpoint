import { describe, expect, it } from 'vitest';

import { detectScript, tokenize, unsupportedScript } from '../src/reader/engine/tokenize.js';
import { TOKENIZE_CASES } from './fixtures/tokenize-cases.js';

describe('tokenize', () => {
  it.each(TOKENIZE_CASES)('handles $name', ({ input, expectedTexts, options, kind }) => {
    const tokens = tokenize(input, options);
    if (expectedTexts !== undefined) expect(tokens.map(({ text }) => text)).toEqual(expectedTexts);

    if (kind === 'long-word') {
      expect(tokens.length).toBeGreaterThan(1);
      expect(tokens.every(({ text }) => Array.from(text).length <= 13)).toBe(true);
      expect(tokens.slice(0, -1).every(({ text }) => text.endsWith('-'))).toBe(true);
      expect(tokens.map(({ text }) => text.replace(/-$/u, '')).join('')).toBe(input);
    }
  });

  it('classifies every named punctuation edge case correctly', () => {
    const byInput = new Map(TOKENIZE_CASES.map((fixture) => [fixture.input, tokenize(fixture.input, fixture.options)]));
    expect(byInput.get('Dr. Smith')?.map(({ sentenceIdx }) => sentenceIdx)).toEqual([0, 0]);
    expect(byInput.get('e.g.')?.[0]?.delayFactor).not.toBe(2.5);
    expect(byInput.get('1,234.56')?.[0]?.delayFactor).toBeCloseTo(1.4 * 1.2 * 1.4);
    expect(byInput.get('wait…')?.[0]?.delayFactor).toBeCloseTo(2.5 * 1.2 * 1.4);
    expect(byInput.get('wait...')?.[0]?.delayFactor).toBeCloseTo(2.5 * 1.2 * 1.4);
    expect(byInput.get('a — b')?.[1]?.delayFactor).toBe(1.8);
    expect(byInput.get('He said "Go."')?.[2]?.delayFactor).toBeCloseTo(2.5 * 1.4);
  });

  it('normalizes whitespace and NFC while retaining original source offsets', () => {
    const tokens = tokenize('  Cafe\u0301\t au\u00a0lait\n\nNext');
    expect(tokens.map(({ text, paraIdx, sourceIdx }) => ({ text, paraIdx, sourceIdx }))).toEqual([
      { text: 'Café', paraIdx: 0, sourceIdx: 2 },
      { text: 'au', paraIdx: 0, sourceIdx: 9 },
      { text: 'lait', paraIdx: 0, sourceIdx: 12 },
      { text: 'Next', paraIdx: 1, sourceIdx: 18 },
    ]);
  });

  it('degrades gracefully for empty input and rejects invalid runtime input', () => {
    expect(tokenize(' \n\t ')).toEqual([]);
    expect(() => tokenize(42 as unknown as string)).toThrow(TypeError);
  });

  it('detects gated scripts with the greater-than-30-percent rule', () => {
    expect(detectScript('abc漢')).toBe('latin');
    expect(detectScript('ab漢字')).toBe('cjk');
    expect(detectScript('abאב')).toBe('rtl');
    expect(unsupportedScript('Ordinary Latin text')).toBeUndefined();
    expect(unsupportedScript('漢字仮名交じり文')).toBe('cjk');
    expect(unsupportedScript('עברית היא שפה')).toBe('rtl');
    expect(tokenize('漢字仮名交じり文')).toHaveLength(1);
  });
});
