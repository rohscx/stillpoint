import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Comfort } from '../src/reader/ui/comfort.js';
import { Scheduler } from '../src/reader/engine/scheduler.js';
import { tokenize } from '../src/reader/engine/tokenize.js';
import { DEFAULT_SETTINGS, READING_COMFORT } from '../src/shared/types.js';

function element() {
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  return {
    hidden: false, textContent: '', className: '',
    style: { setProperty: (key: string, value: string) => properties.set(key, value) },
    classList: { add: (key: string) => classes.add(key), remove: (key: string) => classes.delete(key) },
    addEventListener: () => undefined,
    properties, classes,
    getBoundingClientRect: () => { throw new Error('Comfort must never measure layout'); },
  };
}
const mediaListeners = new Set<() => void>();
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query.includes('reduced-motion') && reduced; },
    addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn),
  }));
});
afterEach(() => { reduced = false; mediaListeners.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(microBlank = false) {
  const frame = { ...element(), ownerDocument: { createElement: () => element() } };
  const settings = { ...DEFAULT_SETTINGS, theme: 'light' as const, comfort: { ...READING_COMFORT, microBlank } };
  const comfort = new Comfort(frame as unknown as HTMLElement, settings);
  const scheduler = new Scheduler(tokenize('Done. word word word'), { settings, clock: comfort.clock });
  scheduler.on('tick', (token, _index, dwell) => comfort.tick(token, dwell));
  scheduler.on('paused', () => comfort.stop());
  scheduler.on('finished', () => comfort.stop());
  return { frame, comfort, scheduler, settings };
}

it('freezes elapsed reading time on pause, resets and removes timers and listeners', () => {
  const { comfort, scheduler } = setup();
  scheduler.play(); vi.advanceTimersByTime(200); scheduler.pause();
  expect(comfort.elapsed).toBe(200);
  vi.advanceTimersByTime(30000);
  expect(comfort.elapsed).toBe(200);
  scheduler.play(); vi.advanceTimersByTime(100); scheduler.pause();
  expect(comfort.elapsed).toBe(300);
  comfort.reset(); expect(comfort.elapsed).toBe(0);
  comfort.destroy();
  expect(mediaListeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('uses the actual scheduler resume floor for a natural pulse', () => {
  const { frame, comfort, scheduler, settings } = setup();
  comfort.apply({ ...settings, comfort: { ...READING_COMFORT, hue: false, pulseGapSeconds: 0 } });
  scheduler.seekWord(1);
  scheduler.play();
  expect(frame.properties.get('--sp-comfort-color')).toBe('hsl(353 75% 41%)');
  vi.advanceTimersByTime(399);
  expect(frame.properties.get('--sp-comfort-color')).toBe('hsl(353 75% 41%)');
  vi.advanceTimersByTime(30);
  expect(frame.properties.get('--sp-comfort-color')).toBe('hsl(353 24.5% 41%)');
  scheduler.pause(); comfort.destroy();
});

it('adds a sentence blank after the complete dwell without skipping a word', () => {
  const { frame, comfort, scheduler } = setup(true);
  scheduler.play();
  vi.advanceTimersByTime(515);
  expect(frame.classes.has('sp-comfort-blank')).toBe(true);
  expect(scheduler.index).toBe(0);
  vi.advanceTimersByTime(24);
  expect(frame.classes.has('sp-comfort-blank')).toBe(false);
  expect(scheduler.index).toBe(1);
  scheduler.pause(); comfort.destroy();
});

it('cancels an in-progress blank on pause and releases it when disabled', () => {
  const { frame, comfort, scheduler, settings } = setup(true);
  scheduler.play(); vi.advanceTimersByTime(515);
  comfort.apply({ ...settings, comfort: { ...settings.comfort, microBlank: false } });
  expect(frame.classes.has('sp-comfort-blank')).toBe(false);
  expect(scheduler.index).toBe(1);
  scheduler.restart(); comfort.reset(); comfort.apply(settings);
  scheduler.play(); vi.advanceTimersByTime(515); scheduler.pause();
  expect(frame.classes.has('sp-comfort-blank')).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(scheduler.index).toBe(0);
  comfort.destroy(); expect(vi.getTimerCount()).toBe(0);
});

it('updates reduced motion live without layout reads or extra DOM construction', () => {
  const { frame, comfort, scheduler } = setup();
  scheduler.play(); vi.advanceTimersByTime(100);
  expect(frame.properties.get('--sp-comfort-transform')).not.toContain('calc(0%');
  reduced = true;
  for (const listener of mediaListeners) listener();
  expect(frame.properties.get('--sp-comfort-transform')).toBe('translate(calc(0% + 0px), 0px)');
  scheduler.pause(); comfort.destroy();
});
