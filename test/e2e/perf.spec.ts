import { expect, test, type Page } from '@playwright/test';

interface Metric {
  name: string;
  value: number;
}

function metric(metrics: readonly Metric[], name: string): number {
  const found = metrics.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`CDP Performance metric is unavailable: ${name}`);
  return found.value;
}

async function flushRendering(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test('800 WPM render ticks stay within CPU and layout budgets', async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  await page.goto('/test/e2e/perf.html');
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector('.sp-word')?.textContent ?? '';
  })).not.toBe('');
  await flushRendering(page);

  const before = await session.send('Performance.getMetrics');
  const durations = await page.evaluate(() => {
    const state = window as unknown as {
      __renderDurations: number[];
      __stillpointShadow: ShadowRoot;
    };
    const target = state.__stillpointShadow.querySelector('.sp-button');
    if (!(target instanceof HTMLElement)) return [];
    state.__renderDurations.length = 0;
    for (let index = 0; index < 300; index += 1) {
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    }
    return [...state.__renderDurations];
  });
  await flushRendering(page);
  const after = await session.send('Performance.getMetrics');

  expect(durations).toHaveLength(300);
  expect(Math.max(...durations)).toBeLessThanOrEqual(2);

  const layoutDelta = metric(after.metrics, 'LayoutCount') - metric(before.metrics, 'LayoutCount');
  const styleDelta = metric(after.metrics, 'RecalcStyleCount') - metric(before.metrics, 'RecalcStyleCount');
  // One coalesced render is expected after the synchronous run; two allows one pending
  // status update without permitting per-tick forced layout (SPEC §7).
  expect(layoutDelta).toBeLessThanOrEqual(2);
  expect(styleDelta).toBeLessThanOrEqual(2);
});

test('code line ticks construct no DOM after block entry and stay within budget', async ({ page }) => {
  await page.goto('/test/e2e/perf.html');
  const result = await page.evaluate(async () => {
    const state = window as unknown as {
      __stillpointHandle: { close: () => void };
      __stillpointShadow: ShadowRoot;
    };
    state.__stillpointHandle.close();
    const nativeCreateElement = Document.prototype.createElement;
    let constructions = 0;
    Document.prototype.createElement = function countedCreateElement(
      name: string,
      options?: ElementCreationOptions,
    ): HTMLElement {
      constructions += 1;
      return nativeCreateElement.call(this, name, options);
    };
    const durations: number[] = [];
    const url = '/dist/reader.js';
    const module = await import(url) as {
      mountReader: (
        blocks: unknown[],
        settings: object,
        instrumentation: { onRender: (duration: number) => void },
      ) => { close: () => void };
    };
    state.__stillpointHandle = module.mountReader([
      { kind: 'text', text: 'Before' },
      { kind: 'code', lines: Array.from({ length: 80 }, (_, index) => `  line_${index}();`) },
      { kind: 'text', text: 'After' },
    ], { wpm: 800 }, { onRender: (duration) => durations.push(duration) });
    const target = state.__stillpointShadow.querySelector('.sp-button');
    if (!(target instanceof HTMLElement)) return { entryConstructions: 0, lineConstructions: -1, durations: [] };
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    const entryConstructions = constructions;
    constructions = 0;
    durations.length = 0;
    for (let index = 0; index < 60; index += 1) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    }
    Document.prototype.createElement = nativeCreateElement;
    return { entryConstructions, lineConstructions: constructions, durations };
  });
  expect(result.entryConstructions).toBeGreaterThan(0);
  expect(result.lineConstructions).toBe(0);
  expect(result.durations).toHaveLength(60);
  expect(Math.max(...result.durations)).toBeLessThanOrEqual(2);
});
