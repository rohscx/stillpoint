export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'code'; lines: string[]; lang?: string };

export interface CodeBlock {
  id: number;
  lines: readonly string[];
  lang?: string;
}

export interface WordToken {
  kind: 'word';
  text: string;
  orp: number;
  delayFactor: number;
  sentenceIdx: number;
  paraIdx: number;
  sourceIdx: number;
}

export interface CodeToken {
  kind: 'code';
  text: string;
  delayFactor: number;
  sentenceIdx: number;
  paraIdx: number;
  sourceIdx: number;
  block: CodeBlock;
  lineIdx: number;
}

export type Token = WordToken | CodeToken;

export interface TimingFactors {
  sentence: number;
  clause: number;
  paragraph: number;
  longWord: number;
  numeric: number;
  paraStart: number;
  codeLine: number;
}

export interface ReaderPosition {
  x: number;
  y: number;
}

export interface ComfortSettings {
  saturation: number;
  weight: 400 | 600 | 700 | 800;
  hue: boolean;
  hueDegrees: number;
  huePeriodSeconds: number;
  pulse: boolean;
  pulseTrigger: 'natural' | 'sentence' | 'long' | 'timer';
  pulseDwellMs: number;
  pulseGapSeconds: number;
  pulseDurationSeconds: number;
  pulseEverySeconds: number;
  pulseSaturation: number;
  pulseLightness: number;
  drift: boolean;
  driftPercent: number;
  driftMinutes: number;
  jitter: boolean;
  microBlank: boolean;
  restNudge: boolean;
  neutral: boolean;
}

export const DEFAULT_COMFORT: Readonly<ComfortSettings> = {
  saturation: 100, weight: 400,
  hue: false, hueDegrees: 10, huePeriodSeconds: 30,
  pulse: false, pulseTrigger: 'natural', pulseDwellMs: 320,
  pulseGapSeconds: 1, pulseDurationSeconds: 1, pulseEverySeconds: 11,
  pulseSaturation: 75, pulseLightness: 0,
  drift: false, driftPercent: 1, driftMinutes: 4,
  jitter: false, microBlank: false, restNudge: false, neutral: false,
};

export const READING_COMFORT: Readonly<ComfortSettings> = {
  ...DEFAULT_COMFORT, saturation: 25, weight: 800, hue: true, pulse: true, drift: true,
};

export interface Settings {
  version: 3;
  wpm: number;
  fontSize: 20 | 28 | 36 | 48;
  theme: 'auto' | 'light' | 'dark';
  maxWordLen: number;
  factors: TimingFactors;
  comfort: ComfortSettings;
  position: ReaderPosition | null;
  autoRewindOnResume: boolean;
  hideControlsWhilePlaying: boolean;
}

export interface SettingsOverrides extends Partial<Omit<Settings, 'factors' | 'comfort'>> {
  factors?: Partial<TimingFactors>;
  comfort?: Partial<ComfortSettings>;
}

export interface TokenizeOptions {
  maxWordLen?: number;
  factors?: Partial<TimingFactors>;
}

export type Script = 'latin' | 'cjk' | 'rtl';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  version: 3,
  wpm: 350,
  fontSize: 36,
  theme: 'auto',
  maxWordLen: 18,
  factors: {
    sentence: 2.5,
    clause: 1.8,
    paragraph: 1.4,
    longWord: 0.05,
    numeric: 1.4,
    paraStart: 1.2,
    codeLine: 1,
  },
  comfort: { ...DEFAULT_COMFORT },
  position: null,
  autoRewindOnResume: true,
  hideControlsWhilePlaying: true,
};
