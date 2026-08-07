export interface KeyboardActions {
  togglePlaying: () => void;
  seekWord: (offset: number) => void;
  seekSentence: (offset: number) => void;
  adjustWpm: (offset: number) => void;
  seekParagraph: (offset: number) => void;
  restart: () => void;
  rewindSentenceAndResume: () => void;
  close: () => void;
  setFontSize: (fontSize: 20 | 28 | 36 | 48) => void;
}

const FONT_SIZES = [20, 28, 36, 48] as const;

export class Keyboard {
  readonly #root: ShadowRoot;
  readonly #actions: KeyboardActions;
  readonly #listener: EventListener;

  constructor(root: ShadowRoot, actions: KeyboardActions) {
    this.#root = root;
    this.#actions = actions;
    this.#listener = (event) => {
      if (event instanceof KeyboardEvent) this.#handle(event);
    };
    root.addEventListener('keydown', this.#listener, { capture: true });
  }

  destroy(): void {
    this.#root.removeEventListener('keydown', this.#listener, { capture: true });
  }

  #handle(event: KeyboardEvent): void {
    const handled = this.#dispatch(event);
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  }

  #dispatch(event: KeyboardEvent): boolean {
    // SPEC §5.2
    if (
      event.repeat
      && (event.key === ' ' || event.key === 'Home' || event.key === 'Escape'
        || event.key.toLocaleLowerCase() === 'r' || /^[1-4]$/u.test(event.key))
    ) return true;
    if (event.key === ' ' && !event.repeat) this.#actions.togglePlaying();
    else if (event.key === 'ArrowLeft' && event.shiftKey) this.#actions.seekSentence(-1);
    else if (event.key === 'ArrowRight' && event.shiftKey) this.#actions.seekSentence(1);
    else if (event.key === 'ArrowLeft') this.#actions.seekWord(-1);
    else if (event.key === 'ArrowRight') this.#actions.seekWord(1);
    else if (event.key === 'ArrowUp') this.#actions.adjustWpm(25);
    else if (event.key === 'ArrowDown') this.#actions.adjustWpm(-25);
    else if (event.key === 'PageUp') this.#actions.seekParagraph(-1);
    else if (event.key === 'PageDown') this.#actions.seekParagraph(1);
    else if (event.key === 'Home' && !event.repeat) this.#actions.restart();
    else if (event.key.toLocaleLowerCase() === 'r' && !event.repeat) this.#actions.rewindSentenceAndResume();
    else if (event.key === 'Escape' && !event.repeat) this.#actions.close();
    else if (/^[1-4]$/u.test(event.key) && !event.repeat) {
      const index = Number(event.key) - 1;
      const size = FONT_SIZES[index];
      if (size !== undefined) this.#actions.setFontSize(size);
    } else return false;
    return true;
  }
}
