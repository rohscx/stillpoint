import type { Script, Token, TokenizeOptions } from '../../shared/types.js';
import { DEFAULT_SETTINGS } from '../../shared/types.js';
import { orpIndexForText } from './orp.js';
import { computeDelayFactor, endsSentence } from './timing.js';

interface Piece {
  text: string;
  paraIdx: number;
  sourceIdx: number;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const LETTER = /^\p{L}$/u;
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
  const script = detectScript(text);
  return script === 'latin' ? undefined : script;
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

/** Chunk sizes that differ by at most one glyph, so a split never leaves a runt. */
function chunkSizes(total: number, limit: number): number[] {
  const count = Math.ceil(total / limit);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function splitLongToken(piece: Piece, maxWordLen: number): Piece[] {
  const glyphs = Array.from(piece.text);
  const chunks: Piece[] = [];
  // Every chunk but the last carries a trailing hyphen, so its content is one short.
  const sizes = chunkSizes(glyphs.length, maxWordLen - 1);
  let offset = 0;
  let consumedCodeUnits = 0;

  for (const [index, size] of sizes.entries()) {
    const isLast = index === sizes.length - 1;
    let end = offset + size;
    if (!isLast) {
      // Nudge onto a vowel/consonant boundary when one is within reach and the shift
      // neither overruns the limit nor starves the following chunk.
      for (const candidate of [end, end - 1, end + 1, end - 2]) {
        const taken = candidate - offset;
        const left = glyphs.length - candidate;
        if (taken < 1 || taken > maxWordLen - 1 || left < 2) continue;
        if (isPreferredBoundary(glyphs, candidate)) {
          end = candidate;
          break;
        }
      }
    }
    const content = glyphs.slice(offset, isLast ? glyphs.length : end).join('');
    chunks.push({
      text: isLast ? content : `${content}-`,
      paraIdx: piece.paraIdx,
      sourceIdx: piece.sourceIdx + consumedCodeUnits,
    });
    consumedCodeUnits += content.length;
    offset = isLast ? glyphs.length : end;
  }

  return chunks;
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
    pieces.push({ text: matched.normalize('NFC'), paraIdx, sourceIdx });
    previousEnd = sourceIdx + matched.length;
  }
  return pieces;
}

export function tokenize(text: string, options: TokenizeOptions = {}): Token[] {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const maxWordLen = options.maxWordLen ?? DEFAULT_SETTINGS.maxWordLen;
  if (!Number.isInteger(maxWordLen) || maxWordLen < 2) {
    throw new RangeError('maxWordLen must be an integer of at least 2');
  }

  // SPEC §2.1: script gating belongs to the caller; tokenisation remains whitespace-based.
  const pieces = rawPieces(text).flatMap((piece) =>
    wordLength(piece.text) > maxWordLen ? splitLongToken(piece, maxWordLen) : [piece],
  );
  const tokens: Token[] = [];
  let sentenceIdx = 0;

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (piece === undefined) continue;
    const previous = pieces[index - 1];
    const next = pieces[index + 1];
    const startsParagraph = previous === undefined || previous.paraIdx !== piece.paraIdx;
    const endsParagraph = next === undefined || next.paraIdx !== piece.paraIdx;
    const token: Token = {
      text: piece.text,
      orp: orpIndexForText(piece.text),
      delayFactor: computeDelayFactor(piece.text, options.factors, { startsParagraph, endsParagraph }),
      sentenceIdx,
      paraIdx: piece.paraIdx,
      sourceIdx: piece.sourceIdx,
    };
    tokens.push(token);
    if (endsSentence(piece.text)) sentenceIdx += 1;
  }

  return tokens;
}
