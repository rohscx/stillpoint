import { describe, expect, it } from 'vitest';

import { orpIndex, orpIndexForText } from '../src/reader/engine/orp.js';

describe('ORP selection', () => {
  it('exhaustively implements the step table for lengths 1 through 30', () => {
    const expected = Array.from({ length: 30 }, (_, offset) => {
      const length = offset + 1;
      if (length === 1) return 0;
      if (length <= 5) return 1;
      if (length <= 9) return 2;
      if (length <= 13) return 3;
      return 4;
    });

    expect(Array.from({ length: 30 }, (_, index) => orpIndex(index + 1))).toEqual(expected);
  });

  it.each([
    ['"Hello,', 3],
    ['((Hello', 3],
    ['“[Hello]', 4],
    ['Hello', 1],
  ])('shifts past leading punctuation in %s', (text, expected) => {
    expect(orpIndexForText(text)).toBe(expected);
  });
});
