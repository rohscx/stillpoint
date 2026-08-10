import { Scheduler } from './engine/scheduler.js';
import { mergeSettings } from './engine/timing.js';
import { tokenize, unsupportedScript } from './engine/tokenize.js';
import { acquireText } from './extract/index.js';
import { Controls } from './ui/controls.js';
import { Drag } from './ui/drag.js';
import { ErrorPanel } from './ui/error.js';
import { Keyboard } from './ui/keyboard.js';
import { Overlay } from './ui/overlay.js';
import { PastePanel, type PastePanelMessage } from './ui/paste.js';
import { Redicle } from './ui/redicle.js';
import { SettingsPanel, type ReaderSettingsPatch } from './ui/settings.js';
import { isStillpointMessage } from '../shared/messages.js';
import { loadSettings, migrate, saveSettings, settingsStorageAvailable } from '../shared/settings.js';
import type { Block, Settings, SettingsOverrides, Token } from '../shared/types.js';

export { acquireText } from './extract/index.js';

declare const __STILLPOINT_INJECTED__: boolean;

const INJECTION_PROPERTY = '__stillpointInjectedReader__';

interface RuntimeMessageEvent {
  addListener: (listener: (message: unknown) => void) => void;
  removeListener: (listener: (message: unknown) => void) => void;
}

interface InjectionRuntime {
  chrome?: { runtime?: { onMessage?: RuntimeMessageEvent } };
  __stillpointInjectedReader__?: InjectionState;
}

interface InjectionState {
  cancelled: boolean;
  close: () => void;
  dispose?: () => void;
}

export interface ReaderHandle {
  close: () => void;
  setWpm: (wpm: number) => void;
  setFontSize: (fontSize: 20 | 28 | 36 | 48) => void;
  setTheme: (theme: 'auto' | 'light' | 'dark') => void;
}

export interface ReaderInstrumentation {
  onRender: (durationMs: number) => void;
}

function injectionRuntime(): InjectionRuntime {
  return globalThis as typeof globalThis & InjectionRuntime;
}

function clearInjectionState(): void {
  const runtime = injectionRuntime();
  runtime[INJECTION_PROPERTY]?.dispose?.();
  delete runtime[INJECTION_PROPERTY];
}

function currentToken(tokens: readonly Token[], index: number): Token | undefined {
  return tokens[Math.min(Math.max(index, 0), Math.max(0, tokens.length - 1))];
}

function blocksText(blocks: readonly Block[]): string {
  return blocks.map((block) => block.kind === 'text' ? block.text : block.lines.join('\n')).join('\n\n');
}

function proseText(blocks: readonly Block[]): string {
  return blocks.filter((block): block is Extract<Block, { kind: 'text' }> => block.kind === 'text')
    .map((block) => block.text)
    .join('\n\n');
}

function mountReaderInOverlay(
  blocks: readonly Block[],
  initialSettings: Settings,
  overlay: Overlay,
  instrumentation?: ReaderInstrumentation,
): ReaderHandle {
  let settings = initialSettings;
  const tokens = tokenize(blocks, { maxWordLen: settings.maxWordLen, factors: settings.factors });
  const scheduler = new Scheduler(tokens, { settings });
  const redicle = new Redicle(document);
  overlay.elements.fullText.textContent = blocksText(blocks);

  let closed = false;
  let keyboard: Keyboard | undefined;
  let drag: Drag | undefined;
  let settingsPanel: SettingsPanel | undefined;
  const unsubscribers: Array<() => void> = [];

  const renderIndex = (index: number): void => {
    const started = instrumentation === undefined ? 0 : performance.now();
    const token = currentToken(tokens, index);
    if (token !== undefined) redicle.render(token);
    controls.update(index, scheduler.wpm);
    if (instrumentation !== undefined) instrumentation.onRender(performance.now() - started);
  };

  const seekWord = (offset: number): void => {
    scheduler.seekWord(offset);
    controls.setPlaying(false);
    renderIndex(scheduler.index);
  };
  const seekSentence = (offset: number): void => {
    scheduler.seekSentence(offset);
    controls.setPlaying(false);
    renderIndex(scheduler.index);
  };
  const seekParagraph = (offset: number): void => {
    const origin = scheduler.index;
    const direction = offset < 0 ? -1 : 1;
    let target = origin + direction;
    while (target >= 0 && target < tokens.length) {
      const candidate = tokens[target];
      if (candidate?.kind === 'word' && candidate.paraIdx !== tokens[origin]?.paraIdx) break;
      target += direction;
    }
    const candidate = tokens[target];
    if (candidate?.kind === 'word') {
      while (target > 0 && tokens[target - 1]?.paraIdx === candidate.paraIdx) target -= 1;
      scheduler.seekWord(target - origin);
    } else scheduler.seekWord(0);
    controls.setPlaying(false);
    renderIndex(scheduler.index);
  };
  const applySettings = (next: Settings): void => {
    settings = next;
    scheduler.setWpm(next.wpm);
    overlay.setTheme(next.theme);
    overlay.setFontSize(next.fontSize);
    drag?.setPosition(next.position);
    settingsPanel?.render(next);
    renderIndex(scheduler.index);
  };
  const persistSettings = (): void => {
    if (!settingsStorageAvailable()) return;
    void saveSettings(settings).catch((error: unknown) => {
      console.error('[Stillpoint] Reader settings storage failed', error);
    });
  };
  const setWpm = (wpm: number): void => {
    scheduler.setWpm(wpm);
    settings = { ...settings, wpm: scheduler.wpm };
    renderIndex(scheduler.index);
    persistSettings();
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    scheduler.pause();
    for (const unsubscribe of unsubscribers) unsubscribe();
    keyboard?.destroy();
    drag?.destroy();
    settingsPanel?.close();
    controls.destroy();
    overlay.close();
    clearInjectionState();
  };
  const togglePlaying = (): void => {
    if (scheduler.isPlaying) scheduler.pause();
    else {
      controls.setStalledPause(false);
      scheduler.play();
    }
    controls.setPlaying(scheduler.isPlaying);
  };

  const controls = new Controls(document, tokens, settings.wpm, {
    previousParagraph: () => seekParagraph(-1),
    previousWord: () => seekWord(-1),
    togglePlaying,
    nextWord: () => seekWord(1),
    nextParagraph: () => seekParagraph(1),
    setWpm,
    openSettings: () => {
      scheduler.pause();
      controls.setPlaying(false);
      const active = overlay.elements.shadowRoot.activeElement;
      settingsPanel?.open(active instanceof HTMLElement ? active : undefined);
    },
    close,
  });
  settingsPanel = new SettingsPanel(document, settings, {
    load: () => loadSettings(),
    save: (patch: ReaderSettingsPatch) => saveSettings({ ...settings, ...patch }),
    apply: applySettings,
  });
  const chrome = document.createElement('div');
  chrome.className = 'sp-reader-chrome';
  chrome.append(controls.progressElement, controls.element, settingsPanel.element);
  overlay.elements.reader.append(redicle.element, chrome);
  drag = new Drag(redicle.element, overlay.elements.reader, settings.position, {
    commit: (position) => {
      settings = { ...settings, position };
      settingsPanel?.render(settings);
      persistSettings();
    },
  });
  overlay.elements.reader.addEventListener('pointermove', () => controls.noteActivity());

  unsubscribers.push(
    scheduler.on('tick', (_token, index) => renderIndex(index)),
    scheduler.on('paused', (reason) => {
      controls.setPlaying(false);
      if (reason === 'stalled') controls.setStalledPause(true);
    }),
    scheduler.on('finished', () => controls.setPlaying(false)),
  );

  keyboard = new Keyboard(overlay.elements.shadowRoot, {
    togglePlaying,
    seekWord,
    seekSentence,
    adjustWpm: (offset) => setWpm(scheduler.wpm + offset),
    seekParagraph,
    restart: () => {
      scheduler.restart();
      controls.setPlaying(false);
      renderIndex(scheduler.index);
    },
    rewindSentenceAndResume: () => {
      scheduler.rewindSentence();
      renderIndex(scheduler.index);
      controls.setStalledPause(false);
      scheduler.play();
      controls.setPlaying(scheduler.isPlaying);
    },
    nudgePosition: (xDirection, yDirection) => drag?.nudge(xDirection, yDirection),
    resetPosition: () => drag?.reset(),
    closePanel: () => {
      if (settingsPanel?.isOpen !== true) return false;
      settingsPanel.close();
      return true;
    },
    close,
    setFontSize: (fontSize) => {
      settings = { ...settings, fontSize };
      overlay.setFontSize(fontSize);
      drag?.reclamp(true);
      settingsPanel?.render(settings);
      persistSettings();
    },
  });

  renderIndex(0);
  controls.setPlaying(false);
  overlay.focus();

  return {
    close,
    setWpm: (wpm) => applySettings({ ...settings, wpm }),
    setFontSize: (fontSize) => applySettings({ ...settings, fontSize }),
    setTheme: (theme) => applySettings({ ...settings, theme }),
  };
}

function mountError(
  settings: Settings,
  context: string,
  error: unknown,
  previousOverlay?: Overlay,
): ReaderHandle {
  console.error(`[Stillpoint] ${context}`, error);
  previousOverlay?.close();
  const overlay = new Overlay(settings.theme, settings.fontSize);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.close();
    clearInjectionState();
  };
  const panel = new ErrorPanel(document, close);
  overlay.elements.reader.append(panel.element);
  overlay.focus();
  return {
    close,
    setWpm: () => undefined,
    setFontSize: (fontSize) => overlay.setFontSize(fontSize),
    setTheme: (theme) => overlay.setTheme(theme),
  };
}

export function mountReader(
  input: string | readonly Block[],
  overrides: SettingsOverrides = {},
  instrumentation?: ReaderInstrumentation,
): ReaderHandle {
  const settings = mergeSettings(overrides);
  let overlay: Overlay | undefined;
  try {
    overlay = new Overlay(settings.theme, settings.fontSize);
    const blocks: readonly Block[] = typeof input === 'string' ? [{ kind: 'text', text: input }] : input;
    return mountReaderInOverlay(blocks, settings, overlay, instrumentation);
  } catch (error) {
    return mountError(settings, 'Reader mounting failed', error, overlay);
  }
}

function scriptMessage(script: 'cjk' | 'rtl'): PastePanelMessage {
  return script === 'cjk'
    ? {
      title: 'CJK text is not supported yet',
      body: 'Support is planned. Paste different text below to keep reading.',
    }
    : {
      title: 'Right-to-left text is not supported yet',
      body: 'Arabic and Hebrew support is planned. Paste different text below to keep reading.',
    };
}

function mountPasteFallback(
  settings: Settings,
  overlay: Overlay,
  message?: PastePanelMessage,
): ReaderHandle {
  let reader: ReaderHandle | undefined;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (reader !== undefined) reader.close();
    else {
      overlay.close();
      clearInjectionState();
    }
  };
  const panel = new PastePanel(document, (text) => {
    if (closed) return;
    const script = unsupportedScript(text);
    if (script !== undefined) {
      panel.setMessage(scriptMessage(script));
      panel.textarea.focus();
      return;
    }
    panel.element.remove();
    try {
      reader = mountReaderInOverlay([{ kind: 'text', text }], settings, overlay);
    } catch (error) {
      reader = mountError(settings, 'Reader mounting failed', error, overlay);
    }
  }, close, message);
  overlay.elements.reader.append(panel.element);
  panel.textarea.focus();

  return {
    close,
    setWpm: (wpm) => reader?.setWpm(wpm),
    setFontSize: (fontSize) => overlay.setFontSize(fontSize),
    setTheme: (theme) => overlay.setTheme(theme),
  };
}

async function acquireAndMount(settings: Settings): Promise<ReaderHandle> {
  let acquisition: Awaited<ReturnType<typeof acquireText>>;
  try {
    acquisition = await acquireText();
  } catch (error) {
    return mountError(settings, 'Text acquisition failed', error);
  }
  let overlay: Overlay | undefined;
  try {
    overlay = new Overlay(settings.theme, settings.fontSize);
    if (acquisition.source === 'paste') return mountPasteFallback(settings, overlay);
    const script = unsupportedScript(proseText(acquisition.blocks));
    if (script !== undefined) return mountPasteFallback(settings, overlay, scriptMessage(script));
    return mountReaderInOverlay(acquisition.blocks, settings, overlay);
  } catch (error) {
    return mountError(settings, 'Reader mounting failed', error, overlay);
  }
}

export async function mountAcquiredReader(overrides: SettingsOverrides = {}): Promise<ReaderHandle> {
  return acquireAndMount(mergeSettings(overrides));
}

async function runInjectedEntry(): Promise<void> {
  const runtime = injectionRuntime();
  const previous = runtime[INJECTION_PROPERTY];
  if (previous !== undefined) {
    previous.close();
    return;
  }

  const state: InjectionState = {
    cancelled: false,
    close: () => {
      state.cancelled = true;
      clearInjectionState();
    },
  };
  runtime[INJECTION_PROPERTY] = state;

  const settings = await loadSettings().catch(() => migrate(undefined));
  if (state.cancelled || runtime[INJECTION_PROPERTY] !== state) return;
  const handle = await acquireAndMount(settings);
  if (state.cancelled || runtime[INJECTION_PROPERTY] !== state) {
    handle.close();
    return;
  }
  const messages = runtime.chrome?.runtime?.onMessage;
  const onMessage = (message: unknown): void => {
    if (!isStillpointMessage(message)) return;
    if (message.kind === 'close') handle.close();
    if (message.kind === 'settings-changed') {
      handle.setWpm(message.settings.wpm);
      handle.setFontSize(message.settings.fontSize);
      handle.setTheme(message.settings.theme);
    }
  };
  messages?.addListener(onMessage);
  state.dispose = () => messages?.removeListener(onMessage);
  state.close = () => handle.close();
}

if (__STILLPOINT_INJECTED__) void runInjectedEntry();
