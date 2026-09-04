import type {
  Block,
  CodeBlock,
  Script,
  Token,
  TokenizeOptions,
  WordToken,
} from '../../shared/types.js';
import { DEFAULT_SETTINGS } from '../../shared/types.js';
import { orpIndexForText } from './orp.js';
import { computeDelayFactor, endsSentence } from './timing.js';

interface Piece {
  text: string;
  paraIdx: number;
  sourceIdx: number;
  originalOffsets?: readonly number[];
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const LETTER = /^\p{L}$/u;
const ALPHANUMERIC = /^[\p{L}\p{N}]$/u;
const OPENING = /^(?:[<"'«‹“‘‚„]|\p{Ps}|\p{Pi})$/u;
const VOWEL = /^[aeiouyà-öø-ÿāăąǎǟ-ǿȁ-ȳ]$/iu;

export function detectScript(text: string): Script {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const codepoints = Array.from(text).filter((character) => !/\s/u.test(character));
  if (codepoints.length === 0) return 'latin';
  const cjkCount = codepoints.filter((character) => CJK.test(character)).length;
  if (cjkCount / codepoints.length > 0.3) return 'cjk';
  const rtlCount = codepoints.filter((character) => RTL.test(character)).length;
  return rtlCount / codepoints.length > 0.3 ? 'rtl' : 'latin';
}

export function unsupportedScript(text: string): Exclude<Script, 'latin'> | undefined {
  for (const paragraph of text.split(/\r?\n[ \t]*\r?\n/u)) {
    const script = detectScript(paragraph);
    if (script !== 'latin') return script;
  }
  return undefined;
}

function isPreferredBoundary(glyphs: readonly string[], position: number): boolean {
  const left = glyphs[position - 1];
  const right = glyphs[position];
  if (left === undefined || right === undefined || !LETTER.test(left) || !LETTER.test(right)) return false;
  return VOWEL.test(left) !== VOWEL.test(right);
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// SPEC §2.1 rule 3: hyphenation is decided on the word, not on punctuation stuck to it.
// 'manufacturers.' is 13 letters and a period; counting the period split a perfectly
// readable word into 'manufacture-' and 'rs.'.
function wordLength(text: string): number {
  return Array.from(text.replace(EDGE_PUNCTUATION, '')).length;
}

// SPEC §2.1: reject absurd individual tokens before planning; never block the page.
const MAX_PLANNED_GLYPHS = 65_536;

interface Plan {
  hyphens: number;
  chunks: number;
  score: number;
  next: number;
}

/**
 * Chooses break points, ranked lexicographically:
 *
 * 1. fewest mid-word breaks — a real seam is worth an extra chunk, which is the whole
 *    point of breaking at seams rather than by length;
 * 2. fewest chunks;
 * 3. evenest chunks, by minimising the sum of squared lengths — target-free, so it
 *    composes over suffixes without knowing the final chunk count.
 */
function planSplit(
  glyphs: readonly string[],
  seamAt: readonly boolean[],
  maxWordLen: number,
): readonly number[] | undefined {
  const total = glyphs.length;
  const endsAtSeam = (at: number): boolean => at === total || seamAt[at] === true;

  const runStart = new Uint32Array(total + 1);
  const runEnd = new Uint32Array(total + 1);
  for (let i = 0; i < total; i += 1) {
    runStart[i + 1] = ALPHANUMERIC.test(glyphs[i] ?? '') ? (runStart[i] ?? i) : i + 1;
  }
  runEnd[total] = total;
  for (let i = total - 1; i >= 0; i -= 1) {
    runEnd[i] = ALPHANUMERIC.test(glyphs[i] ?? '') ? (runEnd[i + 1] ?? i) : i;
  }
  const stubs = (at: number): boolean =>
    at - (runStart[at] ?? at) >= 3 && (runEnd[at] ?? at) - at >= 3;

  const plans = new Array<Plan | undefined>(total + 1).fill(undefined);
  plans[total] = { hyphens: 0, chunks: 0, score: 0, next: total };

  for (let from = total - 1; from >= 0; from -= 1) {
    let winner: Plan | undefined;
    for (let to = from + 1; to <= Math.min(total, from + maxWordLen); to += 1) {
      const midWord = endsAtSeam(to) ? 0 : 1;
      if (midWord === 1 && !stubs(to)) continue;
      if (to - from + midWord > maxWordLen) continue;
      const tail = plans[to];
      if (tail === undefined) continue;
      // A mid-word break off a vowel/consonant boundary reads worse; a tiebreak only.
      const awkward = midWord === 1 && !isPreferredBoundary(glyphs, to) ? 0.3 : 0;
      const candidate: Plan = {
        hyphens: tail.hyphens + midWord,
        chunks: tail.chunks + 1,
        score: tail.score + ((to - from) ** 2) + awkward,
        next: to,
      };
      const better = winner === undefined
        || candidate.hyphens < winner.hyphens
        || (candidate.hyphens === winner.hyphens && candidate.chunks < winner.chunks)
        || (candidate.hyphens === winner.hyphens
          && candidate.chunks === winner.chunks
          && candidate.score < winner.score);
      if (better) winner = candidate;
    }
    plans[from] = winner;
  }

  if (plans[0] === undefined) return undefined;
  const ends: number[] = [];
  for (let at = 0; at < total;) {
    const step = plans[at];
    if (step === undefined) return undefined;
    ends.push(step.next);
    at = step.next;
  }
  return ends;
}

function splitPlanned(piece: Piece, maxWordLen: number): Piece[] | undefined {
  const glyphs = Array.from(piece.text);

  const seamAt = new Array<boolean>(glyphs.length + 1).fill(false);
  let lastWord = -1;
  for (let i = 0; i < glyphs.length; i += 1) {
    if (ALPHANUMERIC.test(glyphs[i] ?? '')) lastWord = i;
  }
  let index = 0;
  while (index < glyphs.length) {
    while (index < glyphs.length && !ALPHANUMERIC.test(glyphs[index] ?? '')) index += 1;
    while (index < glyphs.length && ALPHANUMERIC.test(glyphs[index] ?? '')) index += 1;
    while (index < glyphs.length) {
      const glyph = glyphs[index] ?? '';
      if (ALPHANUMERIC.test(glyph) || (OPENING.test(glyph) && index < lastWord)) break;
      index += 1;
    }
    seamAt[index] = true;
  }

  const ends = planSplit(glyphs, seamAt, maxWordLen);
  if (ends === undefined) return undefined;

  const offsets: number[] = [0];
  for (const glyph of glyphs) offsets.push((offsets.at(-1) ?? 0) + glyph.length);

  const chunks: Piece[] = [];
  let from = 0;
  for (const to of ends) {
    const needsHyphen = to !== glyphs.length && seamAt[to] !== true;
    chunks.push({
      text: glyphs.slice(from, to).join('') + (needsHyphen ? '-' : ''),
      paraIdx: piece.paraIdx,
      sourceIdx: piece.sourceIdx + (piece.originalOffsets?.[offsets[from] ?? 0] ?? offsets[from] ?? 0),
    });
    from = to;
  }
  return chunks;
}

function splitLongToken(piece: Piece, maxWordLen: number): Piece[] {
  const planned = splitPlanned(piece, maxWordLen);
  if (planned !== undefined) return planned;

  // SPEC §2.1: tiny custom limits can make the three-glyph floor impossible.
  return [piece];
}

function rawPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  const matcher = /[^\s\u00a0]+/gu;
  let previousEnd = 0;
  let paraIdx = 0;

  for (const match of text.matchAll(matcher)) {
    const sourceIdx = match.index;
    const between = text.slice(previousEnd, sourceIdx).replace(/\r\n?/gu, '\n');
    if (pieces.length > 0 && /\n[ \t\u00a0]*\n/u.test(between)) paraIdx += 1;
    const matched = match[0];
    if (Array.from(matched).length > MAX_PLANNED_GLYPHS) {
      throw new RangeError('A token exceeds the 65,536-glyph limit');
    }
    const normalized = matched.normalize('NFC');
    const piece: Piece = { text: normalized, paraIdx, sourceIdx };
    if (normalized !== matched) {
      const offsets: number[] = [];
      for (const segment of new Intl.Segmenter().segment(matched)) {
        const content = segment.segment.normalize('NFC');
        for (let i = 0; i < content.length; i += 1) offsets.push(segment.index);
      }
      piece.originalOffsets = offsets;
    }
    pieces.push(piece);
    previousEnd = sourceIdx + matched.length;
  }
  return pieces;
}

function wordTokens(
  text: string,
  options: TokenizeOptions,
  paraOffset: number,
  sentenceOffset: number,
  sourceOffset: number,
): { tokens: WordToken[]; paraCount: number; sentenceCount: number } {
  const maxWordLen = options.maxWordLen ?? DEFAULT_SETTINGS.maxWordLen;
  const pieces = rawPieces(text).flatMap((piece) =>
    wordLength(piece.text) > maxWordLen ? splitLongToken(piece, maxWordLen) : [piece],
  );
  const tokens: WordToken[] = [];
  let sentenceIdx = sentenceOffset;

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (piece === undefined) continue;
    const previous = pieces[index - 1];
    const next = pieces[index + 1];
    const startsParagraph = previous === undefined || previous.paraIdx !== piece.paraIdx;
    const endsParagraph = next === undefined || next.paraIdx !== piece.paraIdx;
    const token: WordToken = {
      kind: 'word',
      text: piece.text,
      orp: orpIndexForText(piece.text),
      delayFactor: computeDelayFactor(piece.text, options.factors, { startsParagraph, endsParagraph }),
      sentenceIdx,
      paraIdx: paraOffset + piece.paraIdx,
      sourceIdx: sourceOffset + piece.sourceIdx,
    };
    tokens.push(token);
    if (endsSentence(piece.text)) sentenceIdx += 1;
  }

  const finalPiece = pieces.at(-1);
  return {
    tokens,
    paraCount: finalPiece === undefined ? 0 : finalPiece.paraIdx + 1,
    sentenceCount: sentenceIdx - sentenceOffset,
  };
}

export function tokenize(input: string | readonly Block[], options: TokenizeOptions = {}): Token[] {
  if (typeof input !== 'string' && !Array.isArray(input)) {
    throw new TypeError('input must be a string or an array of blocks');
  }
  const maxWordLen = options.maxWordLen ?? DEFAULT_SETTINGS.maxWordLen;
  if (!Number.isInteger(maxWordLen) || maxWordLen < 2 || maxWordLen > 256) {
    throw new RangeError('maxWordLen must be an integer from 2 to 256');
  }

  const blocks: readonly Block[] = typeof input === 'string' ? [{ kind: 'text', text: input }] : input;
  const tokens: Token[] = [];
  let paraIdx = 0;
  let sentenceIdx = 0;
  let sourceIdx = 0;
  let codeBlockId = 0;

  // SPEC §§2.1, 2.6: script gating belongs to the caller; code bypasses prose rules.
  for (const block of blocks) {
    if (block.kind === 'text') {
      const result = wordTokens(block.text, options, paraIdx, sentenceIdx, sourceIdx);
      tokens.push(...result.tokens);
      paraIdx += result.paraCount;
      sentenceIdx += result.sentenceCount;
      sourceIdx += block.text.length + 2;
      continue;
    }

    if (tokens.at(-1)?.sentenceIdx === sentenceIdx) sentenceIdx += 1;
    const codeBlock: CodeBlock = block.lang === undefined
      ? { id: codeBlockId, lines: block.lines }
      : { id: codeBlockId, lines: block.lines, lang: block.lang };
    let lineSourceIdx = sourceIdx;
    for (const [lineIdx, line] of block.lines.entries()) {
      tokens.push({
        kind: 'code',
        text: line,
        delayFactor: options.factors?.codeLine ?? DEFAULT_SETTINGS.factors.codeLine,
        sentenceIdx,
        paraIdx,
        sourceIdx: lineSourceIdx,
        block: codeBlock,
        lineIdx,
      });
      lineSourceIdx += line.length + 1;
    }
    codeBlockId += 1;
    paraIdx += 1;
    sentenceIdx += 1;
    sourceIdx = lineSourceIdx + 1;
  }

  return tokens;
}
