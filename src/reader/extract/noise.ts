// SPEC §4 lists these exclusions under the heuristic extractor, but Readability needs
// them too: it happily keeps a bare <div role="banner"> cookie notice that the
// heuristic's block selector would never have matched in the first place.
export const NOISE_SELECTOR = [
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
  '.sr-only',
  '.visually-hidden',
  '.screen-reader-text',
  '.a11y-hidden',
  '.hidden-visually',
].join(', ');

/** Removes chrome from a *cloned* document. Never call this on the live page. */
export function stripNoise(clone: ParentNode): void {
  for (const element of Array.from(clone.querySelectorAll(NOISE_SELECTOR))) {
    element.remove();
  }
}
