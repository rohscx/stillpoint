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
