import { Scheduler } from './engine/scheduler.js';
import { mergeSettings } from './engine/timing.js';
import { tokenize } from './engine/tokenize.js';
import { acquireText } from './extract/index.js';
import { Controls } from './ui/controls.js';
import { Keyboard } from './ui/keyboard.js';
import { Overlay } from './ui/overlay.js';
import { PastePanel } from './ui/paste.js';
import { Redicle } from './ui/redicle.js';
import { isStillpointMessage } from '../shared/messages.js';
import { loadSettings, migrate } from '../shared/settings.js';
import type { Settings, SettingsOverrides, Token } from '../shared/types.js';

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

function mountReaderInOverlay(text: string, settings: Settings, overlay: Overlay): ReaderHandle {
  const tokens = tokenize(text, { maxWordLen: settings.maxWordLen, factors: settings.factors });
  const scheduler = new Scheduler(tokens, { settings });
  const redicle = new Redicle(document);
  overlay.elements.fullText.textContent = text;

  let closed = false;
  let keyboard: Keyboard | undefined;
  const unsubscribers: Array<() => void> = [];

  const renderIndex = (index: number): void => {
    const token = currentToken(tokens, index);
    if (token !== undefined) redicle.render(token);
    controls.update(index, scheduler.wpm);
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
    scheduler.seekParagraph(offset);
    controls.setPlaying(false);
    renderIndex(scheduler.index);
  };
  const setWpm = (wpm: number): void => {
    scheduler.setWpm(wpm);
    renderIndex(scheduler.index);
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    scheduler.pause();
    for (const unsubscribe of unsubscribers) unsubscribe();
    keyboard?.destroy();
    controls.destroy();
    overlay.close();
    clearInjectionState();
  };
  const togglePlaying = (): void => {
    if (scheduler.isPlaying) scheduler.pause();
    else scheduler.play();
    controls.setPlaying(scheduler.isPlaying);
  };

  const controls = new Controls(document, tokens, settings.wpm, {
    previousParagraph: () => seekParagraph(-1),
    previousWord: () => seekWord(-1),
    togglePlaying,
    nextWord: () => seekWord(1),
    nextParagraph: () => seekParagraph(1),
    setWpm,
    openSettings: () => controls.element.focus(),
    close,
  });
  overlay.elements.reader.append(redicle.element, controls.progressElement, controls.element);
  overlay.elements.reader.addEventListener('pointermove', () => controls.noteActivity());

  unsubscribers.push(
    scheduler.on('tick', (_token, index) => renderIndex(index)),
    scheduler.on('paused', () => controls.setPlaying(false)),
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
      scheduler.play();
      controls.setPlaying(scheduler.isPlaying);
    },
    close,
    setFontSize: (fontSize) => overlay.setFontSize(fontSize),
  });

  renderIndex(0);
  controls.setPlaying(false);
  overlay.focus();

  return {
    close,
    setWpm,
    setFontSize: (fontSize) => overlay.setFontSize(fontSize),
    setTheme: (theme) => overlay.setTheme(theme),
  };
}

export function mountReader(text: string, overrides: SettingsOverrides = {}): ReaderHandle {
  const settings = mergeSettings(overrides);
  const overlay = new Overlay(settings.theme, settings.fontSize);
  return mountReaderInOverlay(text, settings, overlay);
}

function mountPasteFallback(settings: Settings): ReaderHandle {
  const overlay = new Overlay(settings.theme, settings.fontSize);
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
    panel.element.remove();
    reader = mountReaderInOverlay(text, settings, overlay);
  }, close);
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
  const acquisition = await acquireText();
  return acquisition.source === 'paste'
    ? mountPasteFallback(settings)
    : mountReaderInOverlay(acquisition.text, settings, new Overlay(settings.theme, settings.fontSize));
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
