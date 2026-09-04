import type { Block } from '../../shared/types.js';

function languageFrom(element: Element): string | undefined {
  const classes = element.getAttribute('class')?.split(/\s+/u) ?? [];
  for (const className of classes) {
    const match = className.match(/^(?:language|lang)-(.+)$/u);
    if (match?.[1] !== undefined && match[1] !== '') return match[1];
  }
  return undefined;
}

// SPEC §4
export function codeBlock(element: Element): Block {
  const code = element.querySelector(':scope > code');
  const source = code ?? element;
  const lines = (source.textContent ?? '').replace(/\r\n?/gu, '\n').split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  const lang = languageFrom(source) ?? languageFrom(element);
  return lang === undefined
    ? { kind: 'code', lines }
    : { kind: 'code', lines, lang };
}

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, div, section, article, main, tr';

// SPEC §4: preserve text on both sides of nested blocks; pre is atomic.
export function collectBlocks(root: Node): Block[] {
  const blocks: Block[] = [];
  let text = '';
  const flush = (): void => {
    const normalized = text.replace(/\s+/gu, ' ').trim();
    if (normalized !== '') blocks.push({ kind: 'text', text: normalized });
    text = '';
  };
  const stack: Array<Node | null> = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null) { flush(); continue; }
    if (node === undefined) continue;
    if (node.nodeType === 3) { text += node.textContent ?? ''; continue; }
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.tagName.toLowerCase() === 'pre') {
        flush();
        blocks.push(codeBlock(element));
        continue;
      }
      if (element.tagName.toLowerCase() === 'br') { text += '\n'; continue; }
      if (element.matches(BLOCK_SELECTOR)) { flush(); stack.push(null); }
    }
    for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
      const child = node.childNodes[i];
      if (child !== undefined) stack.push(child);
    }
  }
  flush();
  return blocks;
}
