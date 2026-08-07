import { describe, expect, it } from 'vitest';
import { cleanExtractedText } from '../src/reader/extract/clean.js';

describe('cleanExtractedText', () => {
  it('removes repeated punctuation and numeric footnotes', () => {
    expect(cleanExtractedText('Wait!!!!! This is sourced.[12]\n\nNext paragraph......'))
      .toBe('Wait This is sourced.\n\nNext paragraph');
  });

  it('trims paragraphs without destroying their boundaries', () => {
    expect(cleanExtractedText('  First paragraph.  \r\n\r\n\tSecond paragraph. \n\n'))
      .toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('drops standalone image-credit paragraphs but keeps ordinary credit language', () => {
    expect(cleanExtractedText('Photo credit: Example Agency\n\nThe committee deserves credit for the result.\n\n© Photographer Name'))
      .toBe('The committee deserves credit for the result.');
  });
});
