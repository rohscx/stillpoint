import { expect, test, type Page } from '@playwright/test';

interface Rect {
  x: number;
  width: number;
}

async function shadowText(page: Page, selector: string): Promise<string> {
  return page.evaluate((target: string) => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector(target)?.textContent ?? '';
  }, selector);
}

// Real key presses, not synthetic dispatch: the point of the capture-phase listener and
// stopPropagation (SPEC §5.2) is how the browser routes actual input, which a manually
// constructed KeyboardEvent bypasses entirely.
async function pressReal(page: Page, key: string, shiftKey = false): Promise<void> {
  const named = key === ' ' ? 'Space' : key;
  await page.keyboard.press(shiftKey ? `Shift+${named}` : named);
}

test.beforeEach(async ({ page }: { page: Page }) => {
  await page.goto('/test/e2e/fixture.html');
  await expect.poll(() => shadowText(page, '.sp-orp')).not.toBe('');
});

test('ORP glyph remains centred on the hash for lengths 1 through 20', async ({ page }: { page: Page }) => {
  for (const theme of ['light', 'dark'] as const) {
    for (const fontSize of [20, 28, 36, 48] as const) {
      await page.evaluate(({
        nextTheme,
        nextSize,
      }: {
        nextTheme: 'light' | 'dark';
        nextSize: 20 | 28 | 36 | 48;
      }) => {
        const handle = (window as unknown as {
          __stillpointHandle: {
            setTheme: (theme: 'light' | 'dark') => void;
            setFontSize: (size: 20 | 28 | 36 | 48) => void;
          };
        }).__stillpointHandle;
        handle.setTheme(nextTheme);
        handle.setFontSize(nextSize);
      }, { nextTheme: theme, nextSize: fontSize });

      await pressReal(page, 'Home');
      for (let length = 1; length <= 20; length += 1) {
        const rects = await page.evaluate(() => {
          const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
          const orp = root.querySelector('.sp-orp');
          const hash = root.querySelector('.sp-hash-top');
          if (!(orp instanceof Element) || !(hash instanceof Element)) return undefined;
          const orpRect = orp.getBoundingClientRect();
          const hashRect = hash.getBoundingClientRect();
          return {
            orp: { x: orpRect.x, width: orpRect.width },
            hash: { x: hashRect.x, width: hashRect.width },
          } satisfies { orp: Rect; hash: Rect };
        });
        expect(rects).toBeDefined();
        if (rects === undefined) return;
        const orpCenter = rects.orp.x + rects.orp.width / 2;
        const hashCenter = rects.hash.x + rects.hash.width / 2;
        expect(Math.abs(orpCenter - hashCenter)).toBeLessThanOrEqual(0.5);
        expect((await shadowText(page, '.sp-word')).length).toBe(length);
        if (length < 20) await pressReal(page, 'ArrowRight');
      }
    }
  }
});

test('all keyboard bindings perform their specified actions', async ({ page }: { page: Page }) => {
  const playLabel = async (): Promise<string | null> => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-button[aria-label="Play"], .sp-button[aria-label="Pause"]')?.getAttribute('aria-label') ?? null;
  });
  const sliderValue = async (): Promise<number> => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const slider = root.querySelector('.sp-slider');
    return slider instanceof HTMLInputElement ? slider.valueAsNumber : 0;
  });

  await pressReal(page, ' ');
  expect(await playLabel()).toBe('Pause');
  await pressReal(page, ' ');
  expect(await playLabel()).toBe('Play');

  await pressReal(page, 'ArrowRight');
  expect(await shadowText(page, '.sp-word')).toBe('bb');
  await pressReal(page, 'ArrowLeft');
  expect(await shadowText(page, '.sp-word')).toBe('a');
  await pressReal(page, 'ArrowUp');
  expect(await sliderValue()).toBe(375);
  await pressReal(page, 'ArrowDown');
  expect(await sliderValue()).toBe(350);
  expect(await page.evaluate(() => (window as unknown as { __pageKeydownCount: number }).__pageKeydownCount)).toBe(0);

  await pressReal(page, 'PageDown');
  expect(await shadowText(page, '.sp-word')).toBe('Second');
  await pressReal(page, 'PageUp');
  expect(await shadowText(page, '.sp-word')).toBe('a');
  await pressReal(page, 'ArrowRight');
  await pressReal(page, 'ArrowRight');
  await pressReal(page, 'ArrowRight');
  await pressReal(page, 'ArrowRight');
  await pressReal(page, 'ArrowRight');
  await pressReal(page, 'ArrowRight', true);
  expect(await shadowText(page, '.sp-word')).toBe('Second');
  await pressReal(page, 'ArrowLeft', true);
  expect(await shadowText(page, '.sp-word')).toBe('a');

  await pressReal(page, 'PageDown');
  await pressReal(page, 'Home');
  expect(await shadowText(page, '.sp-word')).toBe('a');
  await pressReal(page, 'PageDown');
  await pressReal(page, 'ArrowRight');
  await pressReal(page, 'r');
  expect(await shadowText(page, '.sp-word')).toBe('Second');
  expect(await playLabel()).toBe('Pause');
  await pressReal(page, ' ');

  for (const [key, size] of [['1', '20px'], ['2', '28px'], ['3', '36px'], ['4', '48px']] as const) {
    await pressReal(page, key);
    const actual = await page.evaluate(() => {
      const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
      const overlay = root.querySelector('.sp-overlay');
      return overlay === null ? '' : getComputedStyle(overlay).fontSize;
    });
    expect(actual).toBe(size);
  }

  await pressReal(page, 'Escape');
  await expect.poll(() => page.locator('[role="dialog"]').count()).toBe(0);
});
