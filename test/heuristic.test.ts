import { describe, expect, it } from 'vitest';
import { extractHeuristically } from '../src/reader/extract/heuristic.js';

interface FixtureNode {
  tag: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: FixtureNode[];
  hiddenByLayout?: boolean;
}

const BLOCK_NAMES = new Set(['p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
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
      return name === item;
    });
  }
}

function domFixture(bodyChildren: FixtureNode[]): Document {
  const body = new FixtureElement({ tag: 'body', children: bodyChildren });
  const documentFixture = {
    querySelectorAll: (selector: string) => {
      const matches = body.querySelectorAll(selector);
      return body.matches(selector) ? [body, ...matches] : matches;
    },
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
    const text = extractHeuristically(documentRoot);
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
    const text = extractHeuristically(documentRoot);
    expect(text).toContain('Visible primary paragraph');
    expect(text).not.toContain('Hidden from accessibility');
    expect(text).not.toContain('Hidden by CSS');
    expect(text).not.toContain('zero client rectangle');
  });
});
