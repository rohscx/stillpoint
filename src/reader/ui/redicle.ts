import type { CodeToken, Token, WordToken } from '../../shared/types.js';

export class Redicle {
  readonly element: HTMLElement;
  readonly #pre: HTMLSpanElement;
  readonly #orp: HTMLSpanElement;
  readonly #post: HTMLSpanElement;
  readonly #codeHeaderLabel: HTMLElement;
  readonly #codePosition: HTMLElement;
  readonly #codeView: HTMLElement;
  #codeBlockId: number | undefined;
  #codeLines: HTMLElement[] = [];
  #highlightedLine: HTMLElement | undefined;
  #codeLineHeight = 1;
  #visibleLineStart = 0;
  #visibleLineCount = 1;

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

    const codePanel = documentRoot.createElement('section');
    codePanel.className = 'sp-code-panel';
    const codeHeader = documentRoot.createElement('header');
    codeHeader.className = 'sp-code-header';
    this.#codeHeaderLabel = documentRoot.createElement('span');
    this.#codePosition = documentRoot.createElement('span');
    codeHeader.append(this.#codeHeaderLabel, this.#codePosition);
    this.#codeView = documentRoot.createElement('div');
    this.#codeView.className = 'sp-code-view';
    this.#codeView.addEventListener('scroll', () => {
      this.#visibleLineStart = Math.floor(this.#codeView.scrollTop / this.#codeLineHeight);
    });
    codePanel.append(codeHeader, this.#codeView);
    redicle.append(topRule, bottomRule, row, codePanel);
    this.element = redicle;
  }

  render(token: Token): void {
    if (token.kind === 'code') this.#renderCode(token);
    else this.#renderWord(token);
  }

  #renderWord(token: WordToken): void {
    this.element.classList.remove('sp-code-mode');
    this.#codeBlockId = undefined;
    this.#highlightedLine = undefined;
    const glyphs = Array.from(token.text);
    // SPEC §3.1
    this.#pre.textContent = glyphs.slice(0, token.orp).join('');
    this.#orp.textContent = glyphs[token.orp] ?? '';
    this.#post.textContent = glyphs.slice(token.orp + 1).join('');
  }

  #renderCode(token: CodeToken): void {
    this.element.classList.add('sp-code-mode');
    if (this.#codeBlockId !== token.block.id) {
      // SPEC §3.7: line DOM is constructed only on block entry.
      this.#codeLines = token.block.lines.map((line, index) => {
        const element = this.element.ownerDocument.createElement('div');
        element.className = 'sp-code-line';
        element.dataset.line = index.toString();
        element.textContent = line;
        return element;
      });
      this.#codeView.replaceChildren(...this.#codeLines);
      const language = token.block.lang ?? 'code';
      this.#codeHeaderLabel.textContent = `${language} · ${token.block.lines.length} lines`;
      this.#codeBlockId = token.block.id;
      this.#highlightedLine = undefined;
      this.#codeView.scrollTop = 0;
      this.#codeView.scrollLeft = 0;
      this.#codeLineHeight = this.#codeLines[0]?.offsetHeight ?? 1;
      this.#visibleLineStart = 0;
      this.#visibleLineCount = Math.max(1, Math.floor(this.#codeView.clientHeight / this.#codeLineHeight));
    }

    const current = this.#codeLines[token.lineIdx];
    if (current === undefined) return;
    this.#highlightedLine?.classList.remove('sp-code-current');
    current.classList.add('sp-code-current');
    this.#highlightedLine = current;
    this.#codePosition.textContent = `line ${token.lineIdx + 1} / ${token.block.lines.length}`;

    const visibleEnd = this.#visibleLineStart + this.#visibleLineCount;
    if (token.lineIdx < this.#visibleLineStart || token.lineIdx >= visibleEnd) {
      current.scrollIntoView({ block: 'nearest' });
      this.#visibleLineStart = token.lineIdx < this.#visibleLineStart
        ? token.lineIdx
        : token.lineIdx - this.#visibleLineCount + 1;
    }
  }
}
