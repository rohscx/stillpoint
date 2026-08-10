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
  if (!Number.isInteger(maxWordLen) || maxWordLen < 2) {
    throw new RangeError('maxWordLen must be an integer of at least 2');
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
