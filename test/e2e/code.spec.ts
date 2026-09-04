import { expect, test, type Page } from '@playwright/test';

async function codeState(page: Page): Promise<{
  lines: string[];
  current: number;
  header: string;
  wordVisible: boolean;
}> {
  return page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const lines = Array.from(root.querySelectorAll<HTMLElement>('.sp-code-line'));
    const word = root.querySelector<HTMLElement>('.sp-word-row');
    return {
      lines: lines.map((line) => line.textContent ?? ''),
      current: lines.findIndex((line) => line.classList.contains('sp-code-current')),
      header: root.querySelector('.sp-code-header')?.textContent ?? '',
      wordVisible: word !== null && getComputedStyle(word).display !== 'none',
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/code.html');
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector('.sp-word')?.textContent ?? '';
  })).toBe('Before');
});

test('shows the whole block and steps its highlight line by line', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => codeState(page)).toMatchObject({
    lines: ['const values = [1];', '', '  values.push(2); !!!', 'console.log(values);'],
    current: 0,
    wordVisible: false,
  });
  expect((await codeState(page)).header).toContain('ts · 4 lines');

  await page.keyboard.press('ArrowRight');
  expect((await codeState(page)).current).toBe(1);
  await page.keyboard.press('ArrowLeft');
  expect((await codeState(page)).current).toBe(0);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('r');
  expect((await codeState(page)).current).toBe(0);
  await page.keyboard.press('Space');

  await page.keyboard.press('Space');
  await expect.poll(async () => (await codeState(page)).current).toBe(1);
  await page.keyboard.press('Space');
});

test('paragraph navigation lands on the first code line and restores prose', async ({ page }) => {
  await page.keyboard.press('PageDown');
  expect((await codeState(page)).current).toBe(0);
  expect((await codeState(page)).wordVisible).toBe(false);
  await page.keyboard.press('PageDown');
  const state = await codeState(page);
  expect(state.wordVisible).toBe(true);
  expect(await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-word')?.textContent ?? '';
  })).toBe('After');
  await expect.poll(() => page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    return root.querySelector('.sp-status')?.textContent ?? '';
  })).toContain('3 / 4 words');

  await page.keyboard.press('PageUp');
  expect((await codeState(page)).current).toBe(0);
  expect((await codeState(page)).wordVisible).toBe(false);

  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect((await codeState(page)).wordVisible).toBe(false);
  await page.keyboard.press('PageDown');
  expect((await codeState(page)).wordVisible).toBe(true);
});

test('Readability extraction preserves code lines, cleaning-sensitive text, and language', async ({ page }) => {
  const blocks = await page.evaluate(async () => {
    const url = '/dist/reader.js';
    const module = await import(url) as {
      acquireText: (root: Document, selection: string) => Promise<{ blocks: unknown[] }>;
    };
    return (await module.acquireText(document, '')).blocks;
  });
  expect(blocks).toContainEqual({
    kind: 'code',
    lines: ['const values = [1];', '', '  values.push(2); !!!', 'console.log(values);'],
    lang: 'ts',
  });
});
