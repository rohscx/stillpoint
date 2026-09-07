export interface KeyboardActions {
  togglePlaying: () => void;
  seekWord: (offset: number) => void;
  seekSentence: (offset: number) => void;
  adjustWpm: (offset: number) => void;
  seekParagraph: (offset: number) => void;
  restart: () => void;
  rewindSentenceAndResume: () => void;
  nudgePosition: (xDirection: -1 | 0 | 1, yDirection: -1 | 0 | 1) => void;
  resetPosition: () => void;
  closePanel: () => boolean;
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
    if (event.key === 'Escape' && !event.repeat) {
      if (!this.#actions.closePanel()) this.#actions.close();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Text-entry controls must receive literal §5.2 keys while the paste/settings UI has focus.
    const fieldHasFocus = (
      (event.target instanceof HTMLElement && event.target.closest('.sp-settings') !== null)
      ||
      (event.target instanceof HTMLInputElement && event.target.type !== 'range')
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement
      || (event.target instanceof HTMLElement && event.target.isContentEditable)
    );
    if (fieldHasFocus) {
      event.stopPropagation();
      return;
    }
    const handled = this.#dispatch(event);
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  }

  #dispatch(event: KeyboardEvent): boolean {
    // SPEC §§3.6, 5.2
    if (
      event.repeat
      && (event.key === ' ' || event.key === 'Home' || event.key === 'Escape'
        || event.key.toLocaleLowerCase() === 'r' || /^[1-4]$/u.test(event.key))
    ) return true;
    if (event.altKey && event.key === 'ArrowLeft') this.#actions.nudgePosition(-1, 0);
    else if (event.altKey && event.key === 'ArrowRight') this.#actions.nudgePosition(1, 0);
    else if (event.altKey && event.key === 'ArrowUp') this.#actions.nudgePosition(0, -1);
    else if (event.altKey && event.key === 'ArrowDown') this.#actions.nudgePosition(0, 1);
    else if (event.altKey && event.key === '0' && !event.repeat) this.#actions.resetPosition();
    else if (event.key === ' ' && !event.repeat) this.#actions.togglePlaying();
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
