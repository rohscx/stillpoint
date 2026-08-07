import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Token } from '../src/shared/types.js';
import { Scheduler, type SchedulerClock } from '../src/reader/engine/scheduler.js';

function makeTokens(count: number): Token[] {
  return Array.from({ length: count }, (_, index) => ({
    text: `w${index}`,
    orp: 1,
    delayFactor: 1,
    sentenceIdx: Math.floor(index / 10),
    paraIdx: Math.floor(index / 100),
    sourceIdx: index * 2,
  }));
}

function fakeClock(nowOffset: () => number = () => 0): SchedulerClock {
  return {
    now: () => performance.now() + nowOffset(),
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has exactly zero cumulative deadline drift over 10,000 ticks', () => {
    const times: number[] = [];
    const scheduler = new Scheduler(makeTokens(10_001), {
      settings: { wpm: 600 },
      clock: fakeClock(),
    });
    scheduler.on('tick', () => times.push(performance.now()));

    scheduler.play();
    vi.advanceTimersByTime(400 + 9_998 * 100);

    expect(times).toHaveLength(10_000);
    expect(times[0]).toBe(0);
    expect(times[9_999]).toBe(400 + 9_998 * 100);
  });

  it('auto-pauses once after a five-second stall without catch-up ticks', () => {
    let offset = 0;
    const ticks: number[] = [];
    const pauses: string[] = [];
    const scheduler = new Scheduler(makeTokens(100), {
      settings: { wpm: 600 },
      clock: fakeClock(() => offset),
    });
    scheduler.on('tick', (_token, index) => ticks.push(index));
    scheduler.on('paused', (reason) => pauses.push(reason));

    scheduler.play();
    offset = 5_000;
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(10_000);

    expect(ticks).toEqual([0]);
    expect(pauses).toEqual(['stalled']);
    expect(scheduler.isPlaying).toBe(false);
  });

  it('holds the first token for the 400 ms start floor', () => {
    const ticks: number[] = [];
    const scheduler = new Scheduler(makeTokens(3), {
      settings: { wpm: 1_000 },
      clock: fakeClock(),
    });
    scheduler.on('tick', (_token, index) => ticks.push(index));

    scheduler.play();
    vi.advanceTimersByTime(399);
    expect(ticks).toEqual([0]);
    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([0, 1]);
  });

  it('rewinds three words when resuming after a pause longer than three seconds', () => {
    const ticks: number[] = [];
    const scheduler = new Scheduler(makeTokens(20), {
      settings: { wpm: 600, autoRewindOnResume: true },
      clock: fakeClock(),
    });
    scheduler.on('tick', (_token, index) => ticks.push(index));

    scheduler.play();
    vi.advanceTimersByTime(700);
    scheduler.pause();
    expect(ticks).toEqual([0, 1, 2, 3, 4]);
    vi.advanceTimersByTime(3_001);
    scheduler.play();

    expect(ticks.at(-1)).toBe(2);
  });

  it('supports transport navigation and WPM changes', () => {
    const scheduler = new Scheduler(makeTokens(30), { clock: fakeClock() });
    scheduler.seekWord(5);
    expect(scheduler.index).toBe(5);
    scheduler.seekSentence(1);
    expect(scheduler.index).toBe(10);
    scheduler.rewindSentence();
    expect(scheduler.index).toBe(10);
    scheduler.restart();
    expect(scheduler.index).toBe(0);
    scheduler.setWpm(0);
    expect(scheduler.wpm).toBe(150);
    scheduler.setWpm(5_000);
    expect(scheduler.wpm).toBe(1_000);
    expect(() => scheduler.setWpm(Number.NaN)).toThrow(TypeError);
  });
});
