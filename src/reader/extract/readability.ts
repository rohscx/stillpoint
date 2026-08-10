import { Readability } from '@mozilla/readability';
import type { Block } from '../../shared/types.js';
import { codeBlock } from './blocks.js';
import { stripNoise } from './noise.js';

const ARTICLE_BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, div, section, article, main, tr';

function articleBlocks(content: string, documentRoot: Document): Block[] {
  const view = documentRoot.defaultView;
  if (view === null) return [];
  const parsed = new view.DOMParser().parseFromString(content, 'text/html');
  return Array.from(parsed.body.querySelectorAll(ARTICLE_BLOCK_SELECTOR))
    .filter((element) => element.querySelector(ARTICLE_BLOCK_SELECTOR) === null)
    .map((element): Block => element.tagName.toLocaleLowerCase() === 'pre'
      ? codeBlock(element)
      : { kind: 'text', text: (element.textContent ?? '').replace(/\s+/gu, ' ').trim() })
    .filter((block) => block.kind === 'code' || block.text !== '');
}

// This file is the separate lazy bundle entry; never import it statically from reader.iife.js.
export function extractReadableText(documentRoot: Document): Block[] {
  const clone = documentRoot.cloneNode(true);
  const view = documentRoot.defaultView;
  if (view === null || !(clone instanceof view.Document)) return [];
  stripNoise(clone);
  // keepClasses so `language-*` / `lang-*` survives for §4's code-block language. Readability
  // strips class attributes by default, which silently loses the language before blocks.ts
  // looks for it. We re-parse the article HTML ourselves and never render it, so the extra
  // attributes cost nothing.
  const article = new Readability(clone, { keepClasses: true }).parse();
  if (article === null) return [];
  // Readability types content as possibly absent, and it genuinely is on pages it parses
  // but finds no body for. An empty block list lets the caller fall through to the heuristic.
  const { content } = article;
  if (typeof content !== 'string' || content === '') return [];
  // Preserve real paragraph boundaries for tokenizer paraIdx derivation (SPEC §2.1, §4).
  return articleBlocks(content, documentRoot);
}
