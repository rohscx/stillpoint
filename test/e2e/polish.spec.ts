import { expect, test, type Page } from '@playwright/test';

async function installClosedShadowCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function captureClosedRoot(options: ShadowRootInit): ShadowRoot {
      const root = nativeAttachShadow.call(this, options);
      (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow = root;
      return root;
    };
  });
}

async function mountAcquired(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const url = '/dist/reader.js';
    const module = await import(url) as { mountAcquiredReader: () => Promise<unknown> };
    await module.mountAcquiredReader();
  });
}

test('gates CJK acquisition and keeps paste available', async ({ page }) => {
  await installClosedShadowCapture(page);
  await page.goto('/test/e2e/pages/paste.html');
  await page.evaluate(() => {
    document.body.textContent = '漢字仮名交じり文を正しく読むための長い文章です。';
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await mountAcquired(page);

  const gated = await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return {
      title: root?.querySelector('.sp-panel-title')?.textContent ?? '',
      hasPaste: root?.querySelector('.sp-paste-textarea') !== null,
      hasRedicle: root?.querySelector('.sp-redicle') !== null,
    };
  });
  expect(gated).toEqual({ title: 'CJK text is not supported yet', hasPaste: true, hasRedicle: false });

  await page.keyboard.type('A different Latin passage can still be read from this escape hatch.');
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    root?.querySelector<HTMLButtonElement>('.sp-paste button[type="submit"]')?.click();
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector('.sp-word')?.textContent ?? '';
  })).toBe('A');
});

test('settings round-trip through shared storage and fields suppress reader shortcuts', async ({ page }) => {
  await page.goto('/test/e2e/fixture.html');
  await page.evaluate(() => {
    let stored: unknown;
    (window as unknown as { chrome: unknown }).chrome = {
      storage: {
        sync: {
          get: async () => ({ settings: stored }),
          set: async (items: { settings?: unknown }) => { stored = items.settings; },
        },
      },
    };
  });

  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    root.querySelector<HTMLButtonElement>('[aria-label="Settings"]')?.click();
  });
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    root.querySelector<HTMLInputElement>('.sp-settings input[aria-label="Reading speed"]')?.focus();
  });
  const positionBeforeFieldShortcut = await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-redicle')?.getBoundingClientRect().x;
  });
  await page.keyboard.press('r');
  await page.keyboard.press('1');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Alt+ArrowLeft');
  expect(await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-word')?.textContent;
  })).toBe('a');
  expect(await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-redicle')?.getBoundingClientRect().x;
  })).toBe(positionBeforeFieldShortcut);
  expect(await page.evaluate(() => (window as unknown as { __pageKeydownCount: number }).__pageKeydownCount)).toBe(0);

  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const wpm = root.querySelector<HTMLInputElement>('.sp-settings input[aria-label="Reading speed"]');
    if (wpm !== null) {
      wpm.value = '615';
      wpm.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return (root.querySelector('.sp-slider') as HTMLInputElement | null)?.value;
  })).toBe('615');
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const theme = root.querySelector<HTMLSelectElement>('.sp-settings select[aria-label="Theme"]');
    if (theme !== null) {
      theme.value = 'dark';
      theme.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.host.getAttribute('data-theme');
  })).toBe('dark');
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const fontSize = root.querySelector<HTMLSelectElement>('.sp-settings select[aria-label="Font size"]');
    if (fontSize !== null) {
      fontSize.value = '48';
      fontSize.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return {
      wpm: (root.querySelector('.sp-slider') as HTMLInputElement | null)?.value,
      fontSize: getComputedStyle(root.querySelector('.sp-overlay') ?? document.body).fontSize,
    };
  })).toEqual({ wpm: '615', fontSize: '48px' });

  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return (root.querySelector('.sp-settings') as HTMLElement | null)?.hidden;
  })).toBe(true);
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    root.querySelector<HTMLButtonElement>('[aria-label="Settings"]')?.click();
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return {
      wpm: (root.querySelector('input[aria-label="Words per minute"]') as HTMLInputElement | null)?.value,
      theme: (root.querySelector('select[aria-label="Theme"]') as HTMLSelectElement | null)?.value,
      fontSize: (root.querySelector('select[aria-label="Font size"]') as HTMLSelectElement | null)?.value,
    };
  })).toEqual({ wpm: '615', theme: 'dark', fontSize: '48' });
});

test('a background stall explains the automatic pause and clears on play', async ({ page }) => {
  await page.goto('/test/e2e/fixture.html');
  await page.keyboard.press('Space');
  await page.evaluate(() => {
    const deadline = performance.now() + 2_500;
    while (performance.now() < deadline) { /* simulate a throttled background tab */ }
  });
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-status')?.textContent ?? '';
  })).toContain('Paused: tab was backgrounded');

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-status')?.textContent ?? '';
  })).not.toContain('backgrounded');
  await page.keyboard.press('Space');
});

test('an unexpected acquisition failure leaves an honest, closable surface', async ({ page }) => {
  await installClosedShadowCapture(page);
  await page.goto('/test/e2e/pages/paste.html');
  await page.evaluate(() => {
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => { throw new Error('synthetic acquisition failure'); },
    });
  });
  await mountAcquired(page);
  const state = await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return {
      message: root?.querySelector('.sp-error .sp-panel-message')?.textContent ?? '',
      close: root?.querySelector<HTMLButtonElement>('.sp-error .sp-button')?.textContent ?? '',
    };
  });
  expect(state).toEqual({ message: 'Close the reader and try again.', close: 'Close' });
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    root?.querySelector<HTMLButtonElement>('.sp-error .sp-button')?.click();
  });
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});
