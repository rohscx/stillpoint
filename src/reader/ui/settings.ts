import type { Settings } from '../../shared/types.js';

export type ReaderSettingsPatch = Partial<Pick<Settings, 'wpm' | 'theme' | 'fontSize'>>;

export interface SettingsPanelActions {
  load: () => Promise<Settings>;
  save: (patch: ReaderSettingsPatch) => Promise<Settings>;
  apply: (settings: Settings) => void;
}

export class SettingsPanel {
  readonly element: HTMLElement;
  readonly #wpm: HTMLInputElement;
  readonly #theme: HTMLSelectElement;
  readonly #fontSize: HTMLSelectElement;
  readonly #error: HTMLElement;
  readonly #actions: SettingsPanelActions;
  #returnFocus: HTMLElement | undefined;

  constructor(documentRoot: Document, settings: Settings, actions: SettingsPanelActions) {
    this.#actions = actions;
    this.element = documentRoot.createElement('section');
    this.element.className = 'sp-settings';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Reader settings');

    const title = documentRoot.createElement('h2');
    title.className = 'sp-panel-title';
    title.textContent = 'Reader settings';

    this.#wpm = documentRoot.createElement('input');
    this.#wpm.type = 'number';
    this.#wpm.min = '150';
    this.#wpm.max = '1000';
    this.#wpm.step = '5';
    // Distinct from the transport slider's "Words per minute": two controls sharing one
    // accessible name are indistinguishable to a screen reader.
    this.#wpm.setAttribute('aria-label', 'Reading speed');

    this.#theme = documentRoot.createElement('select');
    this.#theme.setAttribute('aria-label', 'Theme');
    for (const [value, label] of [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']] as const) {
      const option = documentRoot.createElement('option');
      option.value = value;
      option.textContent = label;
      this.#theme.append(option);
    }

    this.#fontSize = documentRoot.createElement('select');
    this.#fontSize.setAttribute('aria-label', 'Font size');
    for (const [value, label] of [[20, 'S'], [28, 'M'], [36, 'L'], [48, 'XL']] as const) {
      const option = documentRoot.createElement('option');
      option.value = value.toString();
      option.textContent = label;
      this.#fontSize.append(option);
    }

    const fields = documentRoot.createElement('div');
    fields.className = 'sp-settings-fields';
    fields.append(
      this.#field(documentRoot, 'WPM', this.#wpm),
      this.#field(documentRoot, 'Theme', this.#theme),
      this.#field(documentRoot, 'Font size', this.#fontSize),
    );

    this.#error = documentRoot.createElement('p');
    this.#error.className = 'sp-settings-error';
    this.#error.hidden = true;

    const close = documentRoot.createElement('button');
    close.type = 'button';
    close.className = 'sp-button';
    close.textContent = 'Done';
    close.addEventListener('click', () => this.close());

    const footer = documentRoot.createElement('div');
    footer.className = 'sp-settings-actions';
    footer.append(close);
    this.element.append(title, fields, this.#error, footer);
    this.render(settings);

    this.#wpm.addEventListener('change', () => {
      const value = this.#wpm.valueAsNumber;
      if (Number.isFinite(value)) void this.#save({ wpm: value });
    });
    this.#theme.addEventListener('change', () => {
      const value = this.#theme.value;
      if (value === 'auto' || value === 'light' || value === 'dark') void this.#save({ theme: value });
    });
    this.#fontSize.addEventListener('change', () => {
      const value = Number(this.#fontSize.value);
      if (value === 20 || value === 28 || value === 36 || value === 48) void this.#save({ fontSize: value });
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(returnFocus: HTMLElement | undefined): void {
    this.#returnFocus = returnFocus;
    this.element.hidden = false;
    this.#wpm.focus();
    void this.#actions.load().then((settings) => {
      if (!this.isOpen) return;
      this.render(settings);
      this.#actions.apply(settings);
    }).catch((error: unknown) => this.#showError('Could not load saved settings.', error));
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.hidden = true;
    this.#error.hidden = true;
    this.#returnFocus?.focus();
    this.#returnFocus = undefined;
  }

  render(settings: Settings): void {
    this.#wpm.value = settings.wpm.toString();
    this.#theme.value = settings.theme;
    this.#fontSize.value = settings.fontSize.toString();
  }

  async #save(patch: ReaderSettingsPatch): Promise<void> {
    try {
      const settings = await this.#actions.save(patch);
      this.render(settings);
      this.#actions.apply(settings);
      this.#error.hidden = true;
    } catch (error) {
      this.#showError('Could not save settings.', error);
    }
  }

  #field(documentRoot: Document, text: string, control: HTMLInputElement | HTMLSelectElement): HTMLElement {
    const label = documentRoot.createElement('label');
    const name = documentRoot.createElement('span');
    name.textContent = text;
    label.append(name, control);
    return label;
  }

  #showError(message: string, error: unknown): void {
    this.#error.textContent = message;
    this.#error.hidden = false;
    console.error('[Stillpoint] Reader settings storage failed', error);
  }
}
