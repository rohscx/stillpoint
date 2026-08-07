import styles from './styles.css';

export interface OverlayElements {
  host: HTMLDivElement;
  shadowRoot: ShadowRoot;
  reader: HTMLElement;
  fullText: HTMLElement;
}

function focusableElements(root: ShadowRoot): HTMLElement[] {
  const selector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

export class Overlay {
  readonly elements: OverlayElements;
  readonly #previousFocus: Element | null;
  readonly #previousOverflow: string;
  readonly #previousScrollY: number;
  readonly #onFocusTrap: EventListener;
  #closed = false;

  constructor(theme: 'auto' | 'light' | 'dark', fontSize: 20 | 28 | 36 | 48) {
    this.#previousFocus = document.activeElement;
    this.#previousOverflow = document.documentElement.style.overflow;
    this.#previousScrollY = window.scrollY;

    const host = document.createElement('div');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Stillpoint reader');
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('inset', '0', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    this.#setThemeOn(host, theme);
    host.style.setProperty('--sp-font-size', `${fontSize}px`);

    const shadowRoot = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    shadowRoot.adoptedStyleSheets = [sheet];

    const overlay = document.createElement('div');
    overlay.className = 'sp-overlay';
    const reader = document.createElement('main');
    reader.className = 'sp-reader';
    const fullText = document.createElement('div');
    fullText.className = 'sp-visually-hidden';
    fullText.setAttribute('role', 'document');
    overlay.append(reader, fullText);
    shadowRoot.append(overlay);
    document.documentElement.append(host);

    document.documentElement.style.overflow = 'hidden';
    this.#onFocusTrap = (event) => {
      if (event instanceof KeyboardEvent) this.#trapFocus(event);
    };
    shadowRoot.addEventListener('keydown', this.#onFocusTrap, { capture: true });
    this.elements = { host, shadowRoot, reader, fullText };
  }

  focus(): void {
    const first = focusableElements(this.elements.shadowRoot)[0];
    first?.focus();
  }

  setTheme(theme: 'auto' | 'light' | 'dark'): void {
    this.#setThemeOn(this.elements.host, theme);
  }

  setFontSize(fontSize: 20 | 28 | 36 | 48): void {
    this.elements.host.style.setProperty('--sp-font-size', `${fontSize}px`);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.elements.shadowRoot.removeEventListener('keydown', this.#onFocusTrap, { capture: true });
    this.elements.host.remove();
    if (this.#previousOverflow === '') document.documentElement.style.removeProperty('overflow');
    else document.documentElement.style.overflow = this.#previousOverflow;
    window.scrollTo(0, this.#previousScrollY);
    if (this.#previousFocus instanceof HTMLElement) this.#previousFocus.focus();
  }

  #setThemeOn(host: HTMLElement, theme: 'auto' | 'light' | 'dark'): void {
    if (theme === 'auto') host.removeAttribute('data-theme');
    else host.dataset.theme = theme;
  }

  #trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(this.elements.shadowRoot);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    const active = this.elements.shadowRoot.activeElement;
    if (event.shiftKey && (active === first || active === null)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
