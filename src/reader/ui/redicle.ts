import type { Token } from '../../shared/types.js';

export class Redicle {
  readonly element: HTMLElement;
  readonly #pre: HTMLSpanElement;
  readonly #orp: HTMLSpanElement;
  readonly #post: HTMLSpanElement;

  constructor(documentRoot: Document) {
    const redicle = documentRoot.createElement('div');
    redicle.className = 'sp-redicle';
    redicle.setAttribute('aria-hidden', 'true');

    const topRule = documentRoot.createElement('div');
    topRule.className = 'sp-rule sp-rule-top';
    const bottomRule = documentRoot.createElement('div');
    bottomRule.className = 'sp-rule sp-rule-bottom';
    const topHash = documentRoot.createElement('div');
    topHash.className = 'sp-hash sp-hash-top';
    const bottomHash = documentRoot.createElement('div');
    bottomHash.className = 'sp-hash sp-hash-bottom';
    topRule.append(topHash);
    bottomRule.append(bottomHash);

    const row = documentRoot.createElement('div');
    row.className = 'sp-word-row';
    const word = documentRoot.createElement('div');
    word.className = 'sp-word';
    this.#pre = documentRoot.createElement('span');
    this.#pre.className = 'sp-pre';
    this.#orp = documentRoot.createElement('span');
    this.#orp.className = 'sp-orp';
    this.#post = documentRoot.createElement('span');
    this.#post.className = 'sp-post';
    word.append(this.#pre, this.#orp, this.#post);
    row.append(word);
    redicle.append(topRule, bottomRule, row);
    this.element = redicle;
  }

  render(token: Token): void {
    const glyphs = Array.from(token.text);
    // SPEC §3.1
    this.#pre.textContent = glyphs.slice(0, token.orp).join('');
    this.#orp.textContent = glyphs[token.orp] ?? '';
    this.#post.textContent = glyphs.slice(token.orp + 1).join('');
  }
}
