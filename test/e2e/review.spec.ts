import { expect, test, type Page } from '@playwright/test';
import type { Block, SettingsOverrides } from '../../src/shared/types.js';
import type { ReaderHandle } from '../../src/reader/index.js';

interface ReaderModule {
  mountReader: (input: string | Block[], settings?: SettingsOverrides) => ReaderHandle;
  mountAcquiredReader: () => Promise<ReaderHandle>;
  acquireText: (root?: Document, selected?: string) => Promise<{ blocks: Block[] }>;
}

async function setup(page: Page): Promise<void> {
  await page.goto('/test/e2e/code.html');
  await page.waitForFunction(() => Boolean((window as unknown as { __stillpointHandle?: unknown }).__stillpointHandle));
}

test('#4 selected code bypasses prose cleaning', async ({ page }) => {
  await setup(page);
  const blocks = await page.evaluate(async () => {
    const pre = document.querySelector('pre');
    if (!pre) throw new Error('missing pre');
    const range = document.createRange();
    range.selectNodeContents(pre);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const url = '/dist/reader.js';
    const { acquireText } = await import(url) as ReaderModule;
    return (await acquireText()).blocks;
  });
  expect(blocks).toContainEqual({ kind: 'code', lang: 'ts', lines: ['const values = [1];', '', '  values.push(2); !!!', 'console.log(values);'] });
});

for (const extractor of ['extract', 'heuristic']) {
  test(`#5 ${extractor} preserves text around nested blocks and atomic pre`, async ({ page }) => {
    await setup(page);
    const blocks = await page.evaluate(async (name) => {
      document.body.innerHTML = '<main><article><p>' + 'Substantial introductory prose for the article. '.repeat(12) + '</p><ul><li>Parent instruction<ul><li>Child instruction</li></ul>Trailing instruction</li></ul><pre><div>values[1]; !!!</div></pre><p>' + 'Substantial concluding prose for the article. '.repeat(12) + '</p></article></main>';
      const url = `/dist/${name}.js`;
      const module = await import(url) as { extractReadableText: (root: Document) => Block[]; extractHeuristically: (root: Document) => Block[] };
      return (name === 'extract' ? module.extractReadableText : module.extractHeuristically)(document);
    }, extractor);
    expect(JSON.stringify(blocks)).toContain('Parent instruction');
    expect(JSON.stringify(blocks)).toContain('Child instruction');
    expect(JSON.stringify(blocks)).toContain('Trailing instruction');
    expect(blocks).toContainEqual({ kind: 'code', lines: ['values[1]; !!!'] });
  });
  test(`#6 known limitation: ${extractor} retains stylesheet-hidden descendants`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async (name) => {
      document.body.innerHTML = '<style>.secret {display:none}</style><main><article><p>' + 'Visible meaningful article prose. '.repeat(30) + '<span class="secret">SECRET HIDDEN CONTENT</span></p></article></main>';
      const url = `/dist/${name}.js`;
      const module = await import(url) as { extractReadableText: (root: Document) => Block[]; extractHeuristically: (root: Document) => Block[] };
      return { blocks: (name === 'extract' ? module.extractReadableText : module.extractHeuristically)(document), retained: document.querySelector('.secret')?.textContent };
    }, extractor);
    expect(JSON.stringify(result.blocks)).toContain('SECRET HIDDEN CONTENT');
    expect(result.retained).toBe('SECRET HIDDEN CONTENT');
  });
}

test('#16 Escape closes after range slider focus', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    root.querySelector<HTMLInputElement>('input[type=range]')?.focus();
  });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow.host.isConnected)).toBe(false);
});

test('#14 controls remain visible during playback when configured', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    (window as unknown as { __stillpointHandle: { close: () => void } }).__stillpointHandle.close();
    const url = '/dist/reader.js';
    const { mountReader } = await import(url) as ReaderModule;
    mountReader('word '.repeat(100), { hideControlsWhilePlaying: false });
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1_800);
  expect(await page.evaluate(() => (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow.querySelector('.sp-controls')?.classList.contains('sp-idle'))).toBe(false);
});

test('#1 paste warns about page access and documents the capture boundary', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    (window as unknown as { __stillpointHandle: { close: () => void } }).__stillpointHandle.close();
    document.body.replaceChildren();
    const url = '/dist/reader.js';
    const { mountAcquiredReader } = await import(url) as ReaderModule;
    await mountAcquiredReader();
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    let captured = '';
    document.addEventListener('paste', (event) => { captured = event.clipboardData?.getData('text/plain') ?? ''; }, { capture: true, once: true });
    const data = new DataTransfer();
    data.setData('text/plain', 'private sample');
    root.querySelector('textarea')?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, composed: true, clipboardData: data }));
    return { captured, warning: root.querySelector('.sp-paste-warning')?.textContent };
  });
  expect(result.captured).toBe('private sample');
  expect(result.warning).toContain('page can read');
});

test('#10 and #11 code geometry fits the frame after font and viewport changes', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    (window as unknown as { __stillpointHandle: { close: () => void } }).__stillpointHandle.close();
    const url = '/dist/reader.js';
    const { mountReader } = await import(url) as ReaderModule;
    (window as unknown as { __stillpointHandle: unknown }).__stillpointHandle = mountReader([{ kind: 'code', lines: Array.from({ length: 100 }, (_, i) => `line ${i}`) }]);
  });
  await page.keyboard.press('4');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.waitForTimeout(100);
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
  const geometry = await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow: ShadowRoot }).__stillpointShadow;
    const frame = root.querySelector('.sp-redicle')?.getBoundingClientRect();
    const view = root.querySelector('.sp-code-view')?.getBoundingClientRect();
    const current = root.querySelector('.sp-code-current')?.getBoundingClientRect();
    if (!frame || !view || !current) throw new Error('missing geometry');
    return { frameTop: frame.top, frameBottom: frame.bottom, viewBottom: view.bottom, currentTop: current.top, currentBottom: current.bottom, viewTop: view.top };
  });
  expect(geometry.viewBottom).toBeLessThanOrEqual(geometry.frameBottom);
  expect(geometry.currentTop).toBeGreaterThanOrEqual(geometry.viewTop - 1);
  expect(geometry.currentBottom).toBeLessThanOrEqual(geometry.viewBottom + 1);
  expect(geometry.frameTop).toBeGreaterThanOrEqual(0);
  expect(geometry.frameBottom).toBeLessThanOrEqual(600);
});

test('#4 partial selected code retains language and exact selected punctuation', async ({ page }) => {
  await setup(page);
  const blocks = await page.evaluate(async () => {
    const node = document.querySelector('pre code')?.firstChild;
    if (!node) throw new Error('missing source');
    const range = document.createRange();
    range.setStart(node, 6);
    range.setEnd(node, 19);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const url = '/dist/reader.js';
    const module = await import(url) as ReaderModule;
    return (await module.acquireText()).blocks;
  });
  expect(blocks).toEqual([{ kind: 'code', lang: 'ts', lines: ['values = [1];'] }]);
});

test('#12 an unavailable-frame snapshot takes precedence over the top article', async ({ page }) => {
  await setup(page);
  const blocks = await page.evaluate(async () => {
    const url = '/dist/reader.js';
    const module = await import(url) as ReaderModule;
    return (await module.acquireText(document, 'Selected inside an iframe.')).blocks;
  });
  expect(blocks).toEqual([{ kind: 'text', text: 'Selected inside an iframe.' }]);
});
