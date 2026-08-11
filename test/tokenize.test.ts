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

describe('hyphenation decides on the word, not attached punctuation', () => {
  it.each([
    ['Framework(opens', ['Framework', '(opens']],
    ['foo/bar/baz/qux', ['foo/bar/', 'baz/qux']],
    ['state-of-the-art-design', ['state-of-the-', 'art-design']],
    ['manufacturers.', ['manufacturers.']],
  ] as const)('seam-packs %s exactly', (input, expected) => {
    expect(tokenize(input).map((token) => token.text)).toEqual(expected);
  });

  it('keeps "manufacturers." whole', () => {
    // 13 letters plus a period. Counting the period split it into 'manufacture-' + 'rs.'
    expect(tokenize('manufacturers.').map((t) => t.text)).toEqual(['manufacturers.']);
  });

  it('keeps a 13-letter word whole however it is punctuated', () => {
    for (const punctuated of ['manufacturers,', '"manufacturers"', '(manufacturers)', 'manufacturers?!']) {
      expect(tokenize(punctuated)).toHaveLength(1);
    }
  });

  it('still splits a word that is genuinely too long', () => {
    const chunks = tokenize('Rindfleischetikettierungsgesetz').map((token) => token.text);
    expect(chunks).toEqual(['Rindfleisch-', 'etikettier-', 'ungsgesetz']);
  });

  it('never leaves a runt chunk', () => {
    const words = [
      'Rindfleischetikettierungsaufgabenübertragungsgesetz',
      'antidisestablishmentarianism',
      'pneumonoultramicroscopicsilicovolcanoconiosis.',
      'internationalization,',
    ];
    for (const word of words) {
      const chunks = tokenize(word).map((t) => t.text);
      const shortest = Math.min(...chunks.map((c) => Array.from(c).length));
      const longest = Math.max(...chunks.map((c) => Array.from(c).length));
      expect(shortest).toBeGreaterThanOrEqual(4);
      expect(longest - shortest).toBeLessThanOrEqual(3);
    }
  });

  it('reassembles to the original text', () => {
    for (const word of ['Rindfleischetikettierungsgesetz', 'antidisestablishmentarianism.']) {
      const rejoined = tokenize(word).map((t) => t.text).join('').replace(/-(?=.)/gu, '');
      expect(rejoined).toBe(word);
    }
  });
});

describe('code block tokenization', () => {
  it('never seam-splits or hyphenates a code token', () => {
    const text = 'Framework(opens/foo/bar/supercalifragilisticexpialidocious';
    expect(tokenize([{ kind: 'code', lines: [text] }]).map((token) => token.text)).toEqual([text]);
  });

  it('preserves every line verbatim as one token with shared block metadata', () => {
    const lines = ['function run() {', '', '  const value = supercalifragilisticexpialidocious;', 'x'.repeat(60), '}'];
    const tokens = tokenize([
      { kind: 'text', text: 'Before.' },
      { kind: 'code', lines, lang: 'ts' },
      { kind: 'text', text: 'After.' },
    ]);
    const code = tokens.filter((token) => token.kind === 'code');
    expect(code.map((token) => token.text)).toEqual(lines);
    expect(code).toHaveLength(lines.length);
    expect(new Set(code.map((token) => token.paraIdx)).size).toBe(1);
    expect(new Set(code.map((token) => token.block)).size).toBe(1);
    expect(code[2]?.text).toBe('  const value = supercalifragilisticexpialidocious;');
    expect(code[3]?.text).toHaveLength(60);
    expect(code.every((token) => !('orp' in token))).toBe(true);
  });

  it('applies only the configurable code-line factor', () => {
    const [token] = tokenize([{ kind: 'code', lines: ['statement!!!'] }], {
      factors: { sentence: 9, clause: 8, codeLine: 1.25 },
    });
    expect(token?.kind).toBe('code');
    expect(token?.delayFactor).toBe(1.25);
  });
});
