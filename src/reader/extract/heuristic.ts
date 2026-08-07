import { NOISE_SELECTOR } from './noise.js';

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';
const CONTAINER_SELECTOR = 'article, main, section, div, body';

function normalizedText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function isExcluded(element: Element): boolean {
  return element.closest(NOISE_SELECTOR) !== null;
}

function hasLayoutBox(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0;
}

function isVisible(element: Element, documentRoot: Document): boolean {
  let current: Element | null = element;
  while (current !== null) {
    if (current.hasAttribute('hidden')) return false;
    const style = documentRoot.defaultView?.getComputedStyle(current);
    if (style?.display === 'none') return false;
    current = current.parentElement;
  }
  return hasLayoutBox(element);
}

function semanticBonus(element: Element): number {
  const name = element.tagName.toLocaleLowerCase();
  if (name === 'article') return 600;
  if (name === 'main' || element.getAttribute('role') === 'main') return 400;
  return 0;
}

// Pure DOM input makes the fallback testable without touching the live page (SPEC §4).
export function extractHeuristically(documentRoot: Document): string {
  const blocks = Array.from(documentRoot.querySelectorAll(BLOCK_SELECTOR)).filter((element) => {
    if (isExcluded(element) || !isVisible(element, documentRoot)) return false;
    if (normalizedText(element) === '') return false;
    // Prefer the inner semantic block so a <blockquote><p>…</p></blockquote> is not duplicated.
    return element.querySelector(BLOCK_SELECTOR) === null;
  });
  if (blocks.length === 0) return '';

  const candidates = Array.from(documentRoot.querySelectorAll(CONTAINER_SELECTOR));
  let densest: Element | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const contained = blocks.filter((block) => candidate.contains(block));
    const score = contained.reduce((total, block) => total + normalizedText(block).length + 40, 0)
      + semanticBonus(candidate);
    if (score > bestScore) {
      densest = candidate;
      bestScore = score;
    }
  }

  if (densest === undefined) return '';
  return blocks
    .filter((block) => block === densest || densest.contains(block))
    .map(normalizedText)
    .join('\n\n');
}
