import { describe, expect, it } from 'vitest';
import { extractHeuristically } from '../src/reader/extract/heuristic.js';

interface FixtureNode {
  tag: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: FixtureNode[];
  hiddenByLayout?: boolean;
}

const BLOCK_NAMES = new Set(['p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre']);
const CONTAINER_NAMES = new Set(['article', 'main', 'section', 'div', 'body']);

class FixtureElement {
  readonly tagName: string;
  readonly children: FixtureElement[];
  readonly #text: string;
  readonly #attrs: Record<string, string>;
  readonly #hiddenByLayout: boolean;
  parentElement: FixtureElement | null = null;

  constructor(node: FixtureNode) {
    this.tagName = node.tag.toLocaleUpperCase();
    this.#text = node.text ?? '';
    this.#attrs = node.attrs ?? {};
    this.#hiddenByLayout = node.hiddenByLayout ?? false;
    this.children = (node.children ?? []).map((child) => new FixtureElement(child));
    for (const child of this.children) child.parentElement = this;
  }

  get textContent(): string {
    return [this.#text, ...this.children.map((child) => child.textContent)].join(' ');
  }

  querySelectorAll(selector: string): FixtureElement[] {
    const result: FixtureElement[] = [];
    for (const child of this.children) {
      if (child.#matchesSelector(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }

  querySelector(selector: string): FixtureElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector: string): FixtureElement | null {
    let current: FixtureElement | null = this;
    while (current !== null) {
      if (current.#matchesSelector(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  matches(selector: string): boolean {
    return this.#matchesSelector(selector);
  }

  contains(other: FixtureElement): boolean {
    let current: FixtureElement | null = other;
    while (current !== null) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  cloneNode(deep = false): FixtureElement {
    return new FixtureElement({
      tag: this.tagName.toLocaleLowerCase(),
      text: this.#text,
      attrs: { ...this.#attrs },
      children: deep ? this.children.map((child) => child.#fixtureNode()) : [],
      hiddenByLayout: this.#hiddenByLayout,
    });
  }

  remove(): void {
    const siblings = this.parentElement?.children;
    if (siblings === undefined) return;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }

  hasAttribute(name: string): boolean {
    return this.#attrs[name] !== undefined;
  }

  getAttribute(name: string): string | null {
    return this.#attrs[name] ?? null;
  }

  getBoundingClientRect(): { width: number; height: number } {
    return this.#hiddenByLayout ? { width: 0, height: 0 } : { width: 100, height: 20 };
  }

  getClientRects(): { length: number } {
    return { length: this.#hiddenByLayout ? 0 : 1 };
  }

  styleDisplay(): string {
    return this.#attrs.style?.replace(/\s+/gu, '').includes('display:none') === true ? 'none' : 'block';
  }

  #matchesSelector(selector: string): boolean {
    return selector.split(',').some((part) => {
      const item = part.trim();
      const name = this.tagName.toLocaleLowerCase();
      if (item === 'p, li, blockquote, h1, h2, h3, h4, h5, h6') return BLOCK_NAMES.has(name);
      if (item === 'article, main, section, div, body') return CONTAINER_NAMES.has(name);
      const attribute = item.match(/^\[([^=]+)="([^"]+)"\]$/u);
      if (attribute !== null) return this.#attrs[attribute[1] ?? ''] === attribute[2];
      if (item.startsWith('.')) return (this.#attrs.class ?? '').split(/\s+/u).includes(item.slice(1));
      return name === item;
    });
  }

  #fixtureNode(): FixtureNode {
    return {
      tag: this.tagName.toLocaleLowerCase(),
      text: this.#text,
      attrs: { ...this.#attrs },
      children: this.children.map((child) => child.#fixtureNode()),
      hiddenByLayout: this.#hiddenByLayout,
    };
  }
}

function domFixture(bodyChildren: FixtureNode[]): Document {
  const body = new FixtureElement({ tag: 'body', children: bodyChildren });
  const documentFixture = {
    querySelectorAll: (selector: string) => {
      const matches = body.querySelectorAll(selector);
      return body.matches(selector) ? [body, ...matches] : matches;
    },
    querySelector: (selector: string) => body.matches(selector) ? body : body.querySelector(selector),
    defaultView: {
      getComputedStyle: (element: FixtureElement) => ({ display: element.styleDisplay(), visibility: 'visible' }),
    },
  };
  return documentFixture as unknown as Document;
}

describe('extractHeuristically', () => {
  it('chooses the dense article subtree and excludes structural noise', () => {
    const documentRoot = domFixture([
      { tag: 'header', children: [{ tag: 'p', text: 'Account tools and breaking alerts.' }] },
      { tag: 'nav', children: [{ tag: 'li', text: 'World Business Culture' }] },
      { tag: 'main', children: [{ tag: 'article', children: [
        { tag: 'h1', text: 'The river returns to its old course' },
        { tag: 'p', text: 'After three dry summers, water crossed the northern floodplain before dawn.' },
        { tag: 'p', text: 'Residents watched from the bridge as reed beds filled and migrating birds landed.' },
        { tag: 'blockquote', children: [{ tag: 'p', text: 'This restoration gives the valley room to breathe again.' }] },
      ] }] },
      { tag: 'aside', children: [{ tag: 'p', text: 'Most popular stories and sponsored links.' }] },
      { tag: 'footer', children: [{ tag: 'p', text: 'Copyright and subscription information.' }] },
    ]);
    const text = extractHeuristically(documentRoot).map((block) => block.kind === 'text' ? block.text : block.lines.join('\n')).join('\n\n');
    expect(text).toContain('The river returns to its old course');
    expect(text).toContain('This restoration gives the valley room to breathe again.');
    expect(text).not.toContain('World');
    expect(text).not.toContain('Most popular');
    expect(text).not.toContain('Copyright');
  });

  it('rejects aria-hidden, display-none, and zero-rect blocks', () => {
    const documentRoot = domFixture([{ tag: 'main', children: [
      { tag: 'p', text: 'Visible primary paragraph with enough meaningful words to identify it.' },
      { tag: 'p', text: 'Hidden from accessibility tools.', attrs: { 'aria-hidden': 'true' } },
      { tag: 'div', attrs: { style: 'display: none' }, children: [{ tag: 'p', text: 'Hidden by CSS.' }] },
      { tag: 'p', text: 'Hidden by a zero client rectangle.', hiddenByLayout: true },
      { tag: 'p', text: 'Another visible paragraph completes the primary content.' },
    ] }]);
    const text = extractHeuristically(documentRoot).map((block) => block.kind === 'text' ? block.text : block.lines.join('\n')).join('\n\n');
    expect(text).toContain('Visible primary paragraph');
    expect(text).not.toContain('Hidden from accessibility');
    expect(text).not.toContain('Hidden by CSS');
    expect(text).not.toContain('zero client rectangle');
  });

  it('strips visually-hidden link suffixes from extracted blocks without changing the source', () => {
    const hidden = '(opens in a new tab)';
    const documentRoot = domFixture([{ tag: 'main', children: [
      { tag: 'p', children: [
        { tag: 'a', text: 'Framework' },
        { tag: 'span', text: hidden, attrs: { class: 'sr-only' } },
      ] },
      { tag: 'p', text: 'Visible supporting prose keeps this content region useful to the extractor.' },
    ] }]);
    const blocks = extractHeuristically(documentRoot);
    const text = blocks.map((block) => block.kind === 'text' ? block.text : block.lines.join('\n')).join('\n\n');
    expect(text).toContain('Framework');
    expect(text).not.toContain(hidden);
    expect(documentRoot.querySelector('.sr-only')?.textContent).toContain(hidden);
  });

  it('returns preformatted code verbatim with language metadata', () => {
    const source = 'const values = [1];\n\n  values.push(2); !!!\n';
    const documentRoot = domFixture([{ tag: 'main', children: [
      { tag: 'p', text: 'A prose introduction long enough to establish the dense content region.' },
      { tag: 'pre', text: source, attrs: { class: 'language-ts' } },
      { tag: 'p', text: 'A prose conclusion keeps this fixture representative of an article.' },
    ] }]);
    expect(extractHeuristically(documentRoot)).toContainEqual({
      kind: 'code',
      lines: ['const values = [1];', '', '  values.push(2); !!!'],
      lang: 'ts',
    });
  });
});
