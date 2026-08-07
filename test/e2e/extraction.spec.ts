import { expect, test, type Page } from '@playwright/test';

interface FixtureExpectation {
  path: string;
  minLength: number;
  maxLength: number;
  minParagraphs: number;
  maxParagraphs: number;
  present: string[];
  absent: string[];
  spa?: true;
}

const fixtures: FixtureExpectation[] = [
  {
    path: '/test/e2e/pages/news.html', minLength: 650, maxLength: 1_600, minParagraphs: 4, maxParagraphs: 8,
    present: ['engineers opened the final gate', 'The harbor remains open throughout the work'],
    absent: ['Northstar Daily subscriber', 'Markets', 'We value your privacy', 'corporate links'],
  },
  {
    path: '/test/e2e/pages/blog.html', minLength: 650, maxLength: 1_600, minParagraphs: 4, maxParagraphs: 8,
    present: ['red dust worked into every seam', 'the repaired spine flexes with the pages'],
    absent: ['Home Archive Store', 'Popular posts', 'Cookie choices', 'mailing address'],
  },
  {
    path: '/test/e2e/pages/docs.html', minLength: 650, maxLength: 1_700, minParagraphs: 6, maxParagraphs: 12,
    present: ['A delivery queue pauses after repeated destination failures', 'Resume at the oldest retained event'],
    absent: ['Guides API Reference', 'On this page', 'Documentation cookies', 'language selector'],
  },
  {
    path: '/test/e2e/pages/forum.html', minLength: 700, maxLength: 1_800, minParagraphs: 6, maxParagraphs: 12,
    present: ['I inherited a century-old smoothing plane', 'The three bearing areas now register evenly'],
    absent: ['Topics Members Badges', 'sponsored tool listings', 'This forum uses cookies', 'privacy footer'],
  },
  {
    path: '/test/e2e/pages/spa.html', minLength: 650, maxLength: 1_600, minParagraphs: 4, maxParagraphs: 8,
    present: ['volunteers open a live map', 'public infrastructure that needs patient care'],
    absent: ['Projects Data About', 'Recommended interactive', 'Choose cookies', 'copyright footer'], spa: true,
  },
  {
    path: '/test/e2e/article.html', minLength: 300, maxLength: 900, minParagraphs: 2, maxParagraphs: 5,
    present: ['The eye does not glide smoothly', 'Align every word on that position'],
    absent: ['Navigation that should never', 'Footer text that should never'],
  },
];

async function installClosedShadowCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function captureClosedRoot(options): ShadowRoot {
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

async function extractedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    return root?.querySelector('.sp-visually-hidden')?.textContent ?? '';
  });
}

for (const fixture of fixtures) {
  test(`extracts body paragraphs and rejects page noise: ${fixture.path}`, async ({ page }) => {
    await installClosedShadowCapture(page);
    await page.goto(fixture.path);
    if (fixture.spa === true) {
      await expect.poll(() => page.evaluate(() => (window as unknown as { __spaReady?: boolean }).__spaReady)).toBe(true);
    }
    await mountAcquired(page);
    const text = await extractedText(page);
    const paragraphCount = text.split(/\n\s*\n/u).filter((paragraph) => paragraph.trim() !== '').length;
    expect(text.length).toBeGreaterThanOrEqual(fixture.minLength);
    expect(text.length).toBeLessThanOrEqual(fixture.maxLength);
    expect(paragraphCount).toBeGreaterThanOrEqual(fixture.minParagraphs);
    expect(paragraphCount).toBeLessThanOrEqual(fixture.maxParagraphs);
    for (const sentence of fixture.present) expect(text).toContain(sentence);
    for (const noise of fixture.absent) expect(text).not.toContain(noise);
  });
}

test('a non-empty selection never requests the Readability chunk', async ({ page }) => {
  await installClosedShadowCapture(page);
  const extractRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/extract.js')) extractRequests.push(request.url());
  });
  await page.goto('/test/e2e/pages/news.html');
  await page.evaluate(() => {
    const paragraph = document.querySelector('article p');
    if (paragraph === null) return;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await mountAcquired(page);
  expect(extractRequests).toEqual([]);
  expect(await extractedText(page)).toContain('engineers opened the final gate');
});

test('a failed Readability import degrades to heuristic extraction', async ({ page }) => {
  await installClosedShadowCapture(page);
  await page.route('**/extract.js', (route) => route.abort());
  await page.goto('/test/e2e/pages/news.html');
  await mountAcquired(page);
  const text = await extractedText(page);
  expect(text).toContain('engineers opened the final gate');
  expect(text).toContain('The harbor remains open throughout the work');
  expect(text).not.toContain('We value your privacy');
  expect(text).not.toContain('corporate links');
});

test('paste textarea accepts single-key shortcuts literally and starts reading on submit', async ({ page }) => {
  await installClosedShadowCapture(page);
  await page.route('**/extract.js', (route) => route.abort());
  await page.goto('/test/e2e/pages/paste.html');
  await mountAcquired(page);

  const pasted = 'r 1234 Space and arrow words remain ordinary pasted text.';
  await page.keyboard.type(pasted);
  const state = await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    const textarea = root?.querySelector('.sp-paste-textarea');
    return {
      value: textarea instanceof HTMLTextAreaElement ? textarea.value : '',
      hasRedicle: root?.querySelector('.sp-redicle') !== null,
      panelPresent: root?.querySelector('.sp-paste') !== null,
    };
  });
  expect(state).toEqual({ value: pasted, hasRedicle: false, panelPresent: true });

  await page.evaluate(() => {
    const root = (window as unknown as { __stillpointShadow?: ShadowRoot }).__stillpointShadow;
    const submit = root?.querySelector<HTMLButtonElement>('.sp-paste button[type="submit"]');
    submit?.click();
  });
  await expect.poll(() => extractedText(page)).toBe(pasted);
});
