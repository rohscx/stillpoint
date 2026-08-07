import { Scheduler } from './engine/scheduler.js';
import { mergeSettings } from './engine/timing.js';
import { tokenize } from './engine/tokenize.js';
import { Controls } from './ui/controls.js';
import { Keyboard } from './ui/keyboard.js';
import { Overlay } from './ui/overlay.js';
import { Redicle } from './ui/redicle.js';
import type { SettingsOverrides, Token } from '../shared/types.js';

export interface ReaderHandle {
  close: () => void;
  setFontSize: (fontSize: 20 | 28 | 36 | 48) => void;
  setTheme: (theme: 'auto' | 'light' | 'dark') => void;
}

function currentToken(tokens: readonly Token[], index: number): Token | undefined {
  return tokens[Math.min(Math.max(index, 0), Math.max(0, tokens.length - 1))];
}

export function mountReader(text: string, overrides: SettingsOverrides = {}): ReaderHandle {
  const settings = mergeSettings(overrides);
  const tokens = tokenize(text, { maxWordLen: settings.maxWordLen, factors: settings.factors });
  const scheduler = new Scheduler(tokens, { settings });
  const overlay = new Overlay(settings.theme, settings.fontSize);
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
    setFontSize: (fontSize) => overlay.setFontSize(fontSize),
    setTheme: (theme) => overlay.setTheme(theme),
  };
}
