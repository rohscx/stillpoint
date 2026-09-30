import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_SETTINGS, READING_COMFORT, type Settings } from '../../src/shared/types.js';
import type { ReaderHandle } from '../../src/reader/index.js';

type State = Window & { __stillpointShadow: ShadowRoot; __stillpointHandle: ReaderHandle; __comfortStore?: Settings };

async function click(page: Page, selector: string): Promise<void> {
  await page.evaluate((selector) => (window as unknown as State).__stillpointShadow.querySelector<HTMLElement>(selector)!.click(), selector);
}
async function sample(page: Page) {
  return page.evaluate(() => {
    const root = (window as unknown as State).__stillpointShadow;
    const orp = root.querySelector<HTMLElement>('.sp-orp')!;
    const hash = root.querySelector<HTMLElement>('.sp-hash-top')!;
    const frame = root.querySelector<HTMLElement>('.sp-redicle')!;
    const a = orp.getBoundingClientRect(), b = hash.getBoundingClientRect();
    return { color: getComputedStyle(orp).color, transform: getComputedStyle(frame).transform,
      stroke: getComputedStyle(orp).webkitTextStrokeWidth,
      error: Math.abs(a.x + a.width / 2 - b.x - b.width / 2),
      word: root.querySelector('.sp-word')!.textContent,
      blank: frame.classList.contains('sp-comfort-blank') };
  });
}
async function mount(page: Page, text: string, settings: Settings): Promise<void> {
  await page.evaluate(async ({ text, settings }) => {
    const state = window as unknown as State;
    state.__stillpointHandle.close();
    const url = '/dist/reader.js';
    const module = await import(url) as { mountReader: (text: string, settings: Settings) => ReaderHandle };
    state.__stillpointHandle = module.mountReader(text, settings);
  }, { text, settings });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as State;
    Object.assign(window, { chrome: { storage: { sync: {
      get: async () => ({ settings: state.__comfortStore }),
      set: async (items: { settings: Settings }) => { state.__comfortStore = items.settings; },
    } } } });
  });
  await page.clock.install();
  await page.goto('/test/e2e/fixture.html');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as State).__stillpointHandle)).toBe(true);
});

test('Reading comfort preset applies every value, persists and stays adjustable', async ({ page }) => {
  await click(page, '[aria-label="Settings"]');
  await page.evaluate(() => {
    const root = (window as unknown as State).__stillpointShadow;
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Reading comfort')!.click();
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as State).__comfortStore?.comfort)).toEqual(READING_COMFORT);
  expect(await page.evaluate(() => {
    const root = (window as unknown as State).__stillpointShadow;
    return Object.fromEntries(Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-comfort]')).map(el => [el.dataset.comfort,
      el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.dataset.comfort === 'pulseTrigger' || el.dataset.comfort === 'rampCurve' ? el.value : Number(el.value)]));
  })).toEqual(READING_COMFORT);
  expect(READING_COMFORT).toEqual({
    ramp: true, rampCurve: 'in', rampStart: 70, rampWords: 4, blink: true, blinkMs: 150,
    saturation: 25, weight: 800, hue: true, hueDegrees: 10, huePeriodSeconds: 30,
    pulse: true, pulseTrigger: 'natural', pulseDwellMs: 320, pulseGapSeconds: 1,
    pulseDurationSeconds: 1, pulseEverySeconds: 11, pulseSaturation: 75, pulseLightness: 0,
    drift: true, driftPercent: 1, driftMinutes: 4, jitter: false, microBlank: false, restNudge: false, neutral: false,
  });
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-ramp-chart')?.children.length)).toBe(0);
  expect((await sample(page)).stroke).toBe('0.5px');
  await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector<HTMLElement>('summary')!.focus());
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('details')!.open)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelectorAll('.sp-ramp-chart polyline').length)).toBe(4);
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-ramp-chart [data-blink]') !== null)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-ramp-cost')?.textContent)).toMatch(/^Adds about \d+% to reading time on this article$/);
  const position = (await sample(page)).word;

  await page.evaluate(() => {
    const input = (window as unknown as State).__stillpointShadow.querySelector<HTMLInputElement>('[data-comfort="saturation"]')!;
    input.value = '40'; input.dispatchEvent(new Event('change'));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as State).__comfortStore?.comfort.saturation)).toBe(40);
  expect((await sample(page)).word).toBe(position);
  await page.keyboard.press('Escape');
  await click(page, '[aria-label="Settings"]');
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector<HTMLInputElement>('[data-comfort="saturation"]')!.value)).toBe('40');
});

test('all comfort effects preserve ORP/hash alignment within 0.5 px across sizes and themes', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) for (const fontSize of [20, 28, 36, 48] as const) {
    await mount(page, 'a bb reading extraordinarily Done. '.repeat(100), {
      ...DEFAULT_SETTINGS, theme, fontSize,
      comfort: { ...READING_COMFORT, jitter: true, microBlank: true, restNudge: true, neutral: true },
    });
    await click(page, '[aria-label="Play"]');
    for (let i = 0; i < 10; i++) {
      await page.clock.runFor(333);
      const current = await sample(page);
      expect(current.error).toBeLessThanOrEqual(0.5);
      expect(current.stroke).toBe('0.5px');
      expect(current.transform).not.toBe('none');
    }
  }
});

test('rendered ORP colour changes across a natural pulse and stops at the dwell cap', async ({ page }) => {
  await mount(page, 'Done. short short short short', {
    ...DEFAULT_SETTINGS, wpm: 350, theme: 'light', comfort: { ...READING_COMFORT, hue: false, drift: false },
  });
  const baseline = (await sample(page)).color;
  await click(page, '[aria-label="Play"]');
  const pulse = (await sample(page)).color;
  expect(pulse).not.toBe(baseline);
  await page.clock.runFor(510); // first sentence dwell: 60000/350 * 2.5 * 1.2 = 514.286 ms
  expect((await sample(page)).color).toBe(pulse);
  await page.clock.runFor(50);
  expect((await sample(page)).word).toBe('short');
  expect((await sample(page)).color).toBe(baseline);
});

test('reduced motion suppresses drift and jitter, including live preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page, 'reading words '.repeat(500), { ...DEFAULT_SETTINGS, comfort: { ...READING_COMFORT, jitter: true } });
  await click(page, '[aria-label="Play"]');
  await page.clock.runFor(1000);
  expect((await sample(page)).transform).toBe('none');
  await click(page, '[aria-label="Settings"]');
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('[role="status"]')!.textContent))
    .toContain('Reduced motion is active');
  await page.keyboard.press('Escape');
  // Opening settings loads storage; reapply the test's unsaved settings.
  await page.evaluate(settings => (window as unknown as State).__stillpointHandle.applySettings!(settings), {
    ...DEFAULT_SETTINGS, comfort: { ...READING_COMFORT, jitter: true },
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await click(page, '[aria-label="Play"]');
  await page.clock.runFor(1000);
  expect((await sample(page)).transform).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(33);
  expect((await sample(page)).transform).toBe('none');
});

test('elapsed hue and drift freeze while paused, resume, reset and clean up on close', async ({ page }) => {
  await mount(page, 'reading words '.repeat(500), { ...DEFAULT_SETTINGS, comfort: { ...READING_COMFORT, pulse: false } });
  await click(page, '[aria-label="Play"]');
  await page.clock.runFor(7000);
  await click(page, '[aria-label="Pause"]');
  const paused = await sample(page);
  await page.clock.runFor(60000);
  expect(await sample(page)).toEqual(paused);
  await click(page, '[aria-label="Play"]');
  await page.clock.runFor(1000);
  expect((await sample(page)).transform).not.toBe(paused.transform);
  await page.keyboard.press('Home');
  const reset = await sample(page);
  expect(reset.color).toBe('rgb(130, 79, 85)');
  await page.keyboard.press('Escape');
  await page.clock.runFor(60000);
  expect(await page.locator('[role="dialog"]').count()).toBe(0);
});

test('active comfort prose ticks perform no geometry reads or DOM construction', async ({ page }) => {
  await mount(page, 'reading words '.repeat(500), { ...DEFAULT_SETTINGS, wpm: 800, comfort: READING_COMFORT });
  await page.clock.runFor(100);
  await page.evaluate(() => {
    const state = window as unknown as State & { __comfortReads: number; __comfortCreates: number; __restoreProbes: () => void };
    state.__comfortReads = 0; state.__comfortCreates = 0;
    const originalRect = Element.prototype.getBoundingClientRect;
    const originalCreate = Document.prototype.createElement;
    Element.prototype.getBoundingClientRect = function () {
      state.__comfortReads++; return originalRect.call(this);
    };
    Document.prototype.createElement = function (name: string, options?: ElementCreationOptions) {
      state.__comfortCreates++; return originalCreate.call(this, name, options);
    };
    state.__restoreProbes = () => {
      Element.prototype.getBoundingClientRect = originalRect;
      Document.prototype.createElement = originalCreate;
    };
  });
  await click(page, '[aria-label="Play"]');
  await page.clock.runFor(5000);
  const counts = await page.evaluate(() => {
    const state = window as unknown as { __comfortReads: number; __comfortCreates: number; __restoreProbes: () => void };
    state.__restoreProbes();
    return { reads: state.__comfortReads, creates: state.__comfortCreates };
  });
  expect(counts).toEqual({ reads: 0, creates: 0 });
});


test('ramp changes preserve a mid-article word and update the open chart and cost', async ({ page }) => {
  await mount(page, 'Done. one two three four five six', DEFAULT_SETTINGS);
  await click(page, '[aria-label="Next word"]');
  await click(page, '[aria-label="Next word"]');
  const position = (await sample(page)).word;
  await click(page, '[aria-label="Settings"]');
  await click(page, 'summary');
  await page.evaluate(settings => (window as unknown as State).__stillpointHandle.applySettings?.(settings), {
    ...DEFAULT_SETTINGS, comfort: { ...READING_COMFORT },
  });
  expect((await sample(page)).word).toBe(position);
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as State).__stillpointShadow;
    return root.querySelector('.sp-ramp-chart [data-curve="in"]')?.getAttribute('stroke-width');
  })).toBe('3.5');
  const cost = await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-ramp-cost')?.textContent);
  expect(cost).not.toBe('Adds about 0% to reading time on this article');
  await page.evaluate(settings => (window as unknown as State).__stillpointHandle.applySettings?.(settings), DEFAULT_SETTINGS);
  expect((await sample(page)).word).toBe(position);
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-ramp-cost')?.textContent))
    .toBe('Adds about 0% to reading time on this article');
  expect(await page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-ramp-chart [data-blink]'))).toBeNull();
});

test('effective WPM appears only with ramp, stays stable across ticks and refreshes on settings changes', async ({ page }) => {
  await mount(page, 'Done. one two three four five six. '.repeat(20), DEFAULT_SETTINGS);
  const status = () => page.evaluate(() => (window as unknown as State).__stillpointShadow.querySelector('.sp-status')?.textContent ?? '');
  expect(await status()).toMatch(/^350 WPM · 1 \/ 140 words · \d\d:\d\d left$/);
  await page.evaluate(settings => (window as unknown as State).__stillpointHandle.applySettings?.(settings), {
    ...DEFAULT_SETTINGS, comfort: READING_COMFORT,
  });
  await page.clock.runFor(250);
  expect(await status()).toMatch(/^350 WPM · ≈\d+ effective · 1 \/ 140 words · \d\d:\d\d left$/);
  const effective = (await status()).match(/≈\d+ effective/)?.[0];
  await click(page, '[aria-label="Play"]');
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(500);
    expect((await status()).match(/≈\d+ effective/)?.[0]).toBe(effective);
  }
  await click(page, '[aria-label="Pause"]');
  await page.evaluate(() => (window as unknown as State).__stillpointHandle.setWpm(600));
  await page.clock.runFor(250);
  expect(await status()).toMatch(/^600 WPM · ≈\d+ effective/);
  expect((await status()).match(/≈\d+ effective/)?.[0]).not.toBe(effective);
  await page.evaluate(settings => (window as unknown as State).__stillpointHandle.applySettings?.(settings), {
    ...DEFAULT_SETTINGS, comfort: { ...READING_COMFORT, ramp: false, blink: true },
  });
  await page.clock.runFor(250);
  expect(await status()).toMatch(/^350 WPM · \d+ \/ 140 words · \d\d:\d\d left$/);
  expect(await status()).not.toContain('effective');
});
