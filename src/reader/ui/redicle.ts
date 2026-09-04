import type { CodeToken, Token, WordToken } from '../../shared/types.js';

export class Redicle {
  readonly element: HTMLElement;
  readonly #pre: HTMLSpanElement;
  readonly #orp: HTMLSpanElement;
  readonly #post: HTMLSpanElement;
  readonly #codeHeaderLabel: HTMLElement;
  readonly #codePosition: HTMLElement;
  readonly #codeView: HTMLElement;
  readonly #resizeObserver: ResizeObserver;
  #codeBlockId: number | undefined;
  #codeLines: HTMLElement[] = [];
  #highlightedLine: HTMLElement | undefined;
  #codeLineHeight = 1;
  #visibleLineStart = 0;
  #visibleLineCount = 1;

  constructor(documentRoot: Document, onResize: () => void = () => undefined) {
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
      this.#visibleLineStart = Math.ceil(this.#codeView.scrollTop / this.#codeLineHeight);
    });
    codePanel.append(codeHeader, this.#codeView);
    redicle.append(topRule, bottomRule, row, codePanel);
    this.element = redicle;
    // SPEC §§1.3, 3.7: refresh measurements only on entry or resize, never on line ticks.
    this.#resizeObserver = new ResizeObserver(() => {
      this.#refreshGeometry();
      onResize();
    });
    this.#resizeObserver.observe(redicle);
    this.#resizeObserver.observe(this.#codeView);
  }

  destroy(): void {
    this.#resizeObserver.disconnect();
  }

  #refreshGeometry(): void {
    if (this.#codeBlockId === undefined) return;
    this.#codeLineHeight = Math.max(1, this.#codeLines[0]?.getBoundingClientRect().height ?? 1);
    this.#visibleLineStart = Math.ceil(this.#codeView.scrollTop / this.#codeLineHeight);
    this.#visibleLineCount = Math.max(1, Math.floor(this.#codeView.clientHeight / this.#codeLineHeight));
    if (this.#highlightedLine !== undefined) this.#ensureVisible(Number(this.#highlightedLine.dataset.line));
  }

  #ensureVisible(lineIdx: number): void {
    if (lineIdx < this.#visibleLineStart || lineIdx >= this.#visibleLineStart + this.#visibleLineCount) {
      this.#visibleLineStart = lineIdx < this.#visibleLineStart
        ? lineIdx : lineIdx - this.#visibleLineCount + 1;
      this.#codeView.scrollTop = this.#visibleLineStart * this.#codeLineHeight;
    }
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
      this.#refreshGeometry();
    }

    const current = this.#codeLines[token.lineIdx];
    if (current === undefined) return;
    this.#highlightedLine?.classList.remove('sp-code-current');
    current.classList.add('sp-code-current');
    this.#highlightedLine = current;
    this.#codePosition.textContent = `line ${token.lineIdx + 1} / ${token.block.lines.length}`;

    this.#ensureVisible(token.lineIdx);
  }
}
