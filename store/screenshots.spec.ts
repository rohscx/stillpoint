import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(new URL('./screenshots/', import.meta.url));

async function mountArticle(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function captureClosedRoot(options: ShadowRootInit): ShadowRoot {
      const root = nativeAttachShadow.call(this, options);
      (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow = root;
      return root;
    };
    let settings: unknown;
    (window as unknown as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: async () => ({ settings }),
          set: async (items: { settings?: unknown }) => { settings = items.settings; },
        },
      },
    };
  });
  await page.goto('/test/e2e/pages/news.html');
  await page.evaluate(async () => {
    const module = await import('/dist/reader.js') as {
      mountAcquiredReader: (settings: { theme: 'light' | 'dark'; fontSize: 36 }) => Promise<unknown>;
    };
    (window as unknown as { __stillpointHandle?: unknown }).__stillpointHandle = await module.mountAcquiredReader({
      theme: 'light',
      fontSize: 36,
    });
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector('.sp-word')?.textContent ?? '';
  })).not.toBe('');
  // Move into the article so the shot demonstrates ORP highlighting on a substantial word.
  for (let index = 0; index < 14; index += 1) await page.keyboard.press('ArrowRight');
  // The status line is throttled to 4 Hz (SPEC §3.4), so it still reads the pre-seek
  // position for a moment; let it settle rather than photographing a stale count.
  await page.waitForTimeout(400);
  // Drop the :focus-visible ring the synthetic key presses leave on a transport button.
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    const active = root?.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((nextTheme) => {
    const handle = (window as unknown as {
      __stillpointHandle?: { setTheme: (value: 'light' | 'dark') => void };
    }).__stillpointHandle;
    handle?.setTheme(nextTheme);
  }, theme);
}

test.beforeAll(async () => mkdir(outputDirectory, { recursive: true }));

test('generate Chrome Web Store screenshots from the shipping reader', async ({ page }) => {
  await mountArticle(page);

  await setTheme(page, 'light');
  await page.screenshot({ path: `${outputDirectory}/reader-light.png` });

  await setTheme(page, 'dark');
  await page.screenshot({ path: `${outputDirectory}/reader-dark.png` });

  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    root?.querySelector<HTMLButtonElement>('[aria-label="Settings"]')?.click();
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector<HTMLElement>('.sp-settings')?.hidden;
  })).toBe(false);
  await page.screenshot({ path: `${outputDirectory}/settings.png` });
});
