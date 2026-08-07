import { expect, test, type Page } from '@playwright/test';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function redicleRect(page: Page): Promise<Rect> {
  return page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const rect = root.querySelector('.sp-redicle')?.getBoundingClientRect();
    if (rect === undefined) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function dragBy(page: Page, selector: string, x: number, y: number): Promise<void> {
  const box = await page.evaluate((target) => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const rect = root.querySelector(target)?.getBoundingClientRect();
    if (rect === undefined) return undefined;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, selector);
  expect(box).toBeDefined();
  if (box === undefined) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + x, startY + y, { steps: 3 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/fixture.html');
  await expect.poll(() => redicleRect(page)).not.toMatchObject({ width: 0 });
});

test('dragging the frame moves it', async ({ page }) => {
  const before = await redicleRect(page);
  await dragBy(page, '.sp-redicle', 140, 90);
  const after = await redicleRect(page);
  expect(after.x - before.x).toBeCloseTo(140, 0);
  expect(after.y - before.y).toBeCloseTo(90, 0);
});

test('a drag started on a control does not move the frame', async ({ page }) => {
  const before = await redicleRect(page);
  await dragBy(page, '.sp-slider', 140, 90);
  expect(await redicleRect(page)).toEqual(before);
});

test('the position persists across a remount', async ({ page }) => {
  await page.evaluate(() => {
    let stored: unknown;
    (window as unknown as { chrome: unknown; __storedSettings?: () => unknown }).chrome = {
      storage: {
        sync: {
          get: async () => ({ settings: stored }),
          set: async (items: { settings?: unknown }) => { stored = items.settings; },
        },
      },
    };
    (window as unknown as { __storedSettings: () => unknown }).__storedSettings = () => stored;
  });
  await dragBy(page, '.sp-redicle', 160, 100);
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __storedSettings: () => { position?: unknown } }
  ).__storedSettings()?.position)).toBeTruthy();
  const before = await redicleRect(page);

  await page.evaluate(async () => {
    const target = window as unknown as {
      __stillpointHandle: { close: () => void };
      __storedSettings: () => unknown;
    };
    target.__stillpointHandle.close();
    const url = '/dist/reader.js';
    const module = await import(url) as {
      mountReader: (text: string, settings: object) => unknown;
    };
    target.__stillpointHandle = module.mountReader(
      'Position persistence remains visible across a fresh reader mount.',
      target.__storedSettings() as object,
    ) as { close: () => void };
  });
  await expect.poll(() => redicleRect(page)).toEqual(before);
});

test('Alt+ArrowLeft nudges and Alt+0 resets', async ({ page }) => {
  const initial = await redicleRect(page);
  await page.keyboard.press('Alt+ArrowLeft');
  const nudged = await redicleRect(page);
  expect(nudged.x - initial.x).toBeCloseTo(-25.6, 1);
  expect(nudged.y).toBeCloseTo(initial.y, 5);
  await page.keyboard.press('Alt+0');
  expect(await redicleRect(page)).toEqual(initial);
});

test('dragging toward an edge leaves the frame fully visible', async ({ page }) => {
  await dragBy(page, '.sp-redicle', -2_000, -2_000);
  await page.setViewportSize({ width: 900, height: 600 });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (viewport === null) return;
  await expect.poll(async () => {
    const rect = await redicleRect(page);
    return rect.x >= -0.5
      && rect.y >= -0.5
      && rect.x + rect.width <= viewport.width + 0.5
      && rect.y + rect.height <= viewport.height + 0.5;
  }).toBe(true);
});
