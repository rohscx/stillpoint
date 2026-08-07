import type { TokenizeOptions } from '../../src/shared/types.js';

export interface TokenizeCase {
  name: string;
  input: string;
  expectedTexts?: readonly string[];
  options?: TokenizeOptions;
  kind?: 'long-word';
}

export const TOKENIZE_CASES: readonly TokenizeCase[] = [
  {
    name: 'URL',
    input: 'https://example.com/a/b?c=1',
    expectedTexts: ['https://example.com/a/b?c=1'],
    options: { maxWordLen: 100 },
  },
  {
    name: 'email address',
    input: 'user@example.com',
    expectedTexts: ['user@example.com'],
    options: { maxWordLen: 100 },
  },
  {
    name: 'title abbreviation',
    input: 'Dr. Smith',
    expectedTexts: ['Dr.', 'Smith'],
  },
  {
    name: 'dotted abbreviation',
    input: 'e.g.',
    expectedTexts: ['e.g.'],
  },
  {
    name: 'number with separators',
    input: '1,234.56',
    expectedTexts: ['1,234.56'],
  },
  {
    name: 'Unicode ellipsis',
    input: 'wait…',
    expectedTexts: ['wait…'],
  },
  {
    name: 'ASCII ellipsis',
    input: 'wait...',
    expectedTexts: ['wait...'],
  },
  {
    name: 'spaced em dash',
    input: 'a — b',
    expectedTexts: ['a', '—', 'b'],
  },
  {
    name: 'long German noun',
    input: 'Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz',
    kind: 'long-word',
  },
  {
    name: 'quoted sentence ending',
    input: 'He said "Go."',
    expectedTexts: ['He', 'said', '"Go."'],
  },
  {
    name: 'hyphenated compound',
    input: 'a state-of-the-art design',
    expectedTexts: ['a', 'state-of-the-art', 'design'],
    options: { maxWordLen: 30 },
  },
];
