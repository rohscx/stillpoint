import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsOverrides,
  type TimingFactors,
  type Token,
} from '../../shared/types.js';

export interface TimingContext {
  endsParagraph?: boolean;
  startsParagraph?: boolean;
}

const CLOSING_PUNCTUATION = /["'”’»›)\]}）］｝]+$/u;
const DOTTED_ABBREVIATION = /^(?:[\p{L}]\.){2,}$/u;
const COMMON_ABBREVIATIONS = new Set([
  'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'sr.', 'jr.', 'st.', 'vs.',
  'etc.', 'e.g.', 'i.e.', 'a.m.', 'p.m.',
]);

export function mergeSettings(overrides: SettingsOverrides = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    factors: {
      ...DEFAULT_SETTINGS.factors,
      ...overrides.factors,
    },
  };
}

function punctuationCandidate(text: string): string {
  return text.replace(CLOSING_PUNCTUATION, '');
}

export function endsSentence(text: string): boolean {
  const candidate = punctuationCandidate(text);
  const lower = candidate.toLocaleLowerCase();
  if (COMMON_ABBREVIATIONS.has(lower) || DOTTED_ABBREVIATION.test(candidate)) return false;
  return /(?:\.\.\.|[.!?…])$/u.test(candidate);
}

export function endsClause(text: string): boolean {
  const candidate = punctuationCandidate(text);
  return /[,;:—]$/u.test(candidate) && !/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(candidate);
}

export function computeDelayFactor(
  text: string,
  factors: Partial<TimingFactors> = {},
  context: TimingContext = {},
): number {
  const merged = { ...DEFAULT_SETTINGS.factors, ...factors };
  let result = 1;

  if (endsSentence(text)) result *= merged.sentence;
  else if (endsClause(text)) result *= merged.clause;
  if (context.endsParagraph === true) result *= merged.paragraph;

  const length = Array.from(text).length;
  if (length > 8) result *= Math.min(1.5, 1 + (length - 8) * merged.longWord);
  if (/\p{N}/u.test(text)) result *= merged.numeric;
  if (context.startsParagraph === true) result *= merged.paraStart;

  return result;
}

// delayFactor is baked in at tokenise time, where paragraph context is known. Recomputing
// it here would create a second source of truth that could silently disagree.
export function tokenDurationMs(token: Token, wpm: number): number {
  if (!Number.isFinite(wpm) || wpm <= 0) throw new RangeError('wpm must be a positive finite number');
  return (60_000 / wpm) * token.delayFactor;
}
