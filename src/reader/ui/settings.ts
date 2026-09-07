import { COMFORT_RANGES } from '../../shared/settings.js';
import { READING_COMFORT, type ComfortSettings, type Settings } from '../../shared/types.js';
import { extensionVersion } from '../../shared/version.js';

export type ReaderSettingsPatch = Partial<Pick<Settings, 'wpm' | 'theme' | 'fontSize' | 'position' | 'comfort'>>;

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
  readonly #comfortControls = new Map<keyof ComfortSettings, HTMLInputElement | HTMLSelectElement>();
  readonly #motion = matchMedia('(prefers-reduced-motion: reduce)');
  readonly #motionNote: HTMLElement;
  #comfort: ComfortSettings;
  #returnFocus: HTMLElement | undefined;

  constructor(documentRoot: Document, settings: Settings, actions: SettingsPanelActions) {
    this.#actions = actions;
    this.#comfort = { ...settings.comfort };
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

    const resetPosition = documentRoot.createElement('button');
    resetPosition.type = 'button';
    resetPosition.className = 'sp-button';
    resetPosition.textContent = 'Reset position';
    resetPosition.addEventListener('click', () => void this.#save({ position: null }));

    const footer = documentRoot.createElement('div');
    footer.className = 'sp-settings-actions';
    footer.append(resetPosition, close);
    const version = documentRoot.createElement('p');
    version.className = 'sp-version';
    const loaded = extensionVersion();
    if (loaded === undefined) version.hidden = true;
    else version.textContent = `Stillpoint ${loaded}`;
    const preset = documentRoot.createElement('button');
    preset.type = 'button';
    preset.className = 'sp-button';
    preset.textContent = 'Reading comfort';
    preset.addEventListener('click', () => void this.#save({ comfort: { ...READING_COMFORT } }));
    const details = documentRoot.createElement('details');
    details.className = 'sp-comfort-details';
    const summary = documentRoot.createElement('summary');
    summary.textContent = 'Adjust reading comfort';
    const comfortFields = documentRoot.createElement('div');
    comfortFields.className = 'sp-comfort-fields';
    const labels: Record<keyof ComfortSettings, string> = {
      saturation: 'Baseline saturation (%)', weight: 'ORP weight',
      hue: 'Slow hue variation', hueDegrees: 'Hue radius (degrees)', huePeriodSeconds: 'Hue period (seconds)',
      pulse: 'Saturation pulse', pulseTrigger: 'Pulse trigger', pulseDwellMs: 'Long-word dwell (ms)',
      pulseGapSeconds: 'Minimum pulse gap (seconds)', pulseDurationSeconds: 'Pulse duration cap (seconds)',
      pulseEverySeconds: 'Timer interval (seconds)', pulseSaturation: 'Pulse saturation (%)', pulseLightness: 'Pulse lightness boost',
      drift: 'Slow column drift', driftPercent: 'Frame-width radius (%)', driftMinutes: 'Drift cycle (minutes)',
      jitter: 'Coherent jitter (1 px, 1.5 Hz)', microBlank: 'Sentence micro-blank (24 ms)',
      restNudge: 'Rest nudge (5 minutes)', neutral: 'Neutral colour',
    };
    for (const key of Object.keys(labels) as Array<keyof ComfortSettings>) {
      let control: HTMLInputElement | HTMLSelectElement;
      if (key === 'weight' || key === 'pulseTrigger') {
        control = documentRoot.createElement('select');
        const options = key === 'weight' ? [['400', '400'], ['600', '600'], ['700', '700'], ['800', '800']]
          : [['natural', 'Natural pauses'], ['sentence', 'Sentence ends'], ['long', 'Long words'], ['timer', 'Independent timer']];
        for (const [value, label] of options) {
          const option = documentRoot.createElement('option');
          option.value = value!;
          option.textContent = label!;
          control.append(option);
        }
      } else {
        control = documentRoot.createElement('input');
        control.type = typeof settings.comfort[key] === 'boolean' ? 'checkbox' : 'number';
        if (key in COMFORT_RANGES) {
          const [min, max, step] = COMFORT_RANGES[key as keyof typeof COMFORT_RANGES];
          control.min = String(min); control.max = String(max); control.step = String(step);
        }
      }
      control.setAttribute('aria-label', labels[key]);
      control.dataset.comfort = key;
      this.#comfortControls.set(key, control);
      comfortFields.append(this.#field(documentRoot, labels[key], control));
      control.addEventListener('change', () => {
        if (!control.checkValidity()) { control.reportValidity(); return; }
        const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked
          : key === 'pulseTrigger' ? control.value : Number(control.value);
        this.#comfort = { ...this.#comfort, [key]: value };
        void this.#save({ comfort: { ...this.#comfort } });
      });
    }
    const note = documentRoot.createElement('p');
    note.className = 'sp-comfort-note';
    note.textContent = 'One reader’s preference from uncontrolled trials. Adjustable, not a proven remedy. Natural pulses last the word’s dwell, capped by duration; timer interval applies only to timer mode. Neutral colour overrides colour cycles.';
    this.#motionNote = documentRoot.createElement('p');
    this.#motionNote.className = 'sp-comfort-note';
    this.#motionNote.setAttribute('role', 'status');
    this.#motion.addEventListener('change', this.#showMotion);
    this.#showMotion();
    details.append(summary, note, comfortFields);
    this.element.append(title, fields, preset, this.#motionNote, details, this.#error, version, footer);
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

  destroy(): void {
    this.close();
    this.#motion.removeEventListener('change', this.#showMotion);
  }

  readonly #showMotion = (): void => {
    this.#motionNote.textContent = this.#motion.matches
      ? 'Reduced motion is active: column drift and jitter are disabled. Colour pulses may continue.'
      : 'Your system’s reduced-motion preference disables column drift and jitter.';
  };

  render(settings: Settings): void {
    this.#comfort = { ...settings.comfort };
    for (const [key, control] of this.#comfortControls) {
      if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(settings.comfort[key]);
      else control.value = String(settings.comfort[key]);
    }
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
