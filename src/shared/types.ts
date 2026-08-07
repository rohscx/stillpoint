export interface Token {
  text: string;
  orp: number;
  delayFactor: number;
  sentenceIdx: number;
  paraIdx: number;
  sourceIdx: number;
}

export interface TimingFactors {
  sentence: number;
  clause: number;
  paragraph: number;
  longWord: number;
  numeric: number;
  paraStart: number;
}

export interface Settings {
  version: 1;
  wpm: number;
  fontSize: 20 | 28 | 36 | 48;
  theme: 'auto' | 'light' | 'dark';
  maxWordLen: number;
  factors: TimingFactors;
  autoRewindOnResume: boolean;
  hideControlsWhilePlaying: boolean;
}

export interface SettingsOverrides extends Partial<Omit<Settings, 'factors'>> {
  factors?: Partial<TimingFactors>;
}

export interface TokenizeOptions {
  maxWordLen?: number;
  factors?: Partial<TimingFactors>;
}

export type Script = 'latin' | 'cjk' | 'rtl';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  version: 1,
  wpm: 350,
  fontSize: 36,
  theme: 'auto',
  maxWordLen: 13,
  factors: {
    sentence: 2.5,
    clause: 1.8,
    paragraph: 1.4,
    longWord: 0.05,
    numeric: 1.4,
    paraStart: 1.2,
  },
  autoRewindOnResume: true,
  hideControlsWhilePlaying: true,
};
