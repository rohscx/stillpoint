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

function isPreferredBoundary(glyphs: readonly string[], position: number): boolean {
  const left = glyphs[position - 1];
  const right = glyphs[position];
  if (left === undefined || right === undefined || !LETTER.test(left) || !LETTER.test(right)) return false;
  return VOWEL.test(left) !== VOWEL.test(right);
}

function splitLongToken(piece: Piece, maxWordLen: number): Piece[] {
  const remaining = Array.from(piece.text);
  const chunks: Piece[] = [];
  const contentLimit = maxWordLen - 1;
  let consumedCodeUnits = 0;

  while (remaining.length > maxWordLen) {
    let splitAt = contentLimit;
    for (let candidate = contentLimit; candidate >= Math.max(1, contentLimit - 2); candidate -= 1) {
      if (isPreferredBoundary(remaining, candidate)) {
        splitAt = candidate;
        break;
      }
    }

    const content = remaining.splice(0, splitAt).join('');
    chunks.push({
      text: `${content}-`,
      paraIdx: piece.paraIdx,
      sourceIdx: piece.sourceIdx + consumedCodeUnits,
    });
    consumedCodeUnits += content.length;
  }

  chunks.push({
    text: remaining.join(''),
    paraIdx: piece.paraIdx,
    sourceIdx: piece.sourceIdx + consumedCodeUnits,
  });
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
    Array.from(piece.text).length > maxWordLen ? splitLongToken(piece, maxWordLen) : [piece],
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
