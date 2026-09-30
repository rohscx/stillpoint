import type { Token } from '../../shared/types.js';
import { tokenDurationMs } from './timing.js';

export interface ArticleTiming {
  totalMs: number;
  proseMs: number;
  proseWords: number;
  effectiveWpm: number;
  remainingMs: readonly number[];
  wordsThrough: readonly number[];
}

// SPEC §§3.4, 3.8: derive once on article/settings changes, never during ticks.
export function articleTiming(tokens: readonly Token[], wpm: number): ArticleTiming {
  const remainingMs = new Array<number>(tokens.length + 1).fill(0);
  const wordsThrough: number[] = [];
  let proseMs = 0;
  let proseWords = 0;
  for (const [index, token] of tokens.entries()) {
    const duration = Math.max(index === 0 ? 400 : 0, tokenDurationMs(token, wpm));
    remainingMs[index] = duration;
    if (token.kind === 'word') {
      proseWords += 1;
      proseMs += duration;
    }
    wordsThrough.push(proseWords);
  }
  for (let index = tokens.length - 1; index >= 0; index--) {
    remainingMs[index] = (remainingMs[index] ?? 0) + (remainingMs[index + 1] ?? 0);
  }
  return {
    totalMs: remainingMs[0] ?? 0,
    proseMs,
    proseWords,
    effectiveWpm: proseMs === 0 ? 0 : proseWords * 60000 / proseMs,
    remainingMs,
    wordsThrough,
  };
}
