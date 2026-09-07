import { DEFAULT_COMFORT, DEFAULT_SETTINGS, type ComfortSettings, type ReaderPosition, type Settings, type TimingFactors } from './types.js';

const STORAGE_KEY = 'settings';
const FONT_SIZES: readonly Settings['fontSize'][] = [20, 28, 36, 48];

export interface SettingsStorageArea {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

interface ChromeStorageGlobal {
  chrome?: { storage?: { sync?: SettingsStorageArea } };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const candidate = finiteNumber(value, fallback);
  return candidate > 0 ? clamp(candidate, 0.01, 10) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function fontSize(value: unknown): Settings['fontSize'] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.fontSize;
  let closest = FONT_SIZES[0] ?? DEFAULT_SETTINGS.fontSize;
  for (const candidate of FONT_SIZES) {
    if (Math.abs(candidate - value) < Math.abs(closest - value)) closest = candidate;
  }
  return closest;
}

function timingFactors(value: unknown): TimingFactors {
  const raw = record(value) ?? {};
  return {
    sentence: positiveNumber(raw.sentence, DEFAULT_SETTINGS.factors.sentence),
    clause: positiveNumber(raw.clause, DEFAULT_SETTINGS.factors.clause),
    paragraph: positiveNumber(raw.paragraph, DEFAULT_SETTINGS.factors.paragraph),
    longWord: positiveNumber(raw.longWord, DEFAULT_SETTINGS.factors.longWord),
    numeric: positiveNumber(raw.numeric, DEFAULT_SETTINGS.factors.numeric),
    paraStart: positiveNumber(raw.paraStart, DEFAULT_SETTINGS.factors.paraStart),
    codeLine: positiveNumber(raw.codeLine, DEFAULT_SETTINGS.factors.codeLine),
  };
}

function position(value: unknown): ReaderPosition | null {
  const raw = record(value);
  if (raw === undefined) return DEFAULT_SETTINGS.position;
  const x = finiteNumber(raw.x, Number.NaN);
  const y = finiteNumber(raw.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return DEFAULT_SETTINGS.position;
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
}

export const COMFORT_RANGES = {
  saturation: [0, 100, 1], hueDegrees: [1, 25, 1], huePeriodSeconds: [5, 120, 1],
  pulseDwellMs: [120, 1500, 10], pulseGapSeconds: [0, 120, 0.1],
  pulseDurationSeconds: [0.1, 20, 0.1], pulseEverySeconds: [2, 120, 1],
  pulseSaturation: [0, 100, 1], pulseLightness: [0, 30, 1],
  driftPercent: [0.25, 2, 0.25], driftMinutes: [1, 10, 0.5],
} as const;

function comfortSettings(value: unknown): ComfortSettings {
  const raw = record(value) ?? {};
  const result = { ...DEFAULT_COMFORT };
  for (const key of Object.keys(COMFORT_RANGES) as Array<keyof typeof COMFORT_RANGES>) {
    const [min, max] = COMFORT_RANGES[key];
    result[key] = clamp(finiteNumber(raw[key], result[key]), min, max);
  }
  for (const key of ['hue', 'pulse', 'drift', 'jitter', 'microBlank', 'restNudge', 'neutral'] as const) {
    result[key] = booleanValue(raw[key], result[key]);
  }
  if (raw.weight === 400 || raw.weight === 600 || raw.weight === 700 || raw.weight === 800) result.weight = raw.weight;
  if (raw.pulseTrigger === 'natural' || raw.pulseTrigger === 'sentence' || raw.pulseTrigger === 'long' || raw.pulseTrigger === 'timer') result.pulseTrigger = raw.pulseTrigger;
  return result;
}

// SPEC §5.3
export function migrate(value: unknown): Settings {
  const raw = record(value) ?? {};
  // maxWordLen has never been exposed in any UI, so a stored value can only be the old
  // default. Version 1 shipped 13, which split ordinary words like 'infrastructure' at a
  // place no dictionary allows; version 2 adopts the wider default rather than stranding
  // existing installs on it.
  const storedVersion = finiteNumber(raw.version, 0);
  const rawMaxWordLen = storedVersion >= 2
    ? finiteNumber(raw.maxWordLen, DEFAULT_SETTINGS.maxWordLen)
    : DEFAULT_SETTINGS.maxWordLen;
  const theme = raw.theme === 'auto' || raw.theme === 'light' || raw.theme === 'dark'
    ? raw.theme
    : DEFAULT_SETTINGS.theme;

  return {
    version: DEFAULT_SETTINGS.version,
    wpm: clamp(finiteNumber(raw.wpm, DEFAULT_SETTINGS.wpm), 150, 1_000),
    fontSize: fontSize(raw.fontSize),
    theme,
    maxWordLen: rawMaxWordLen >= 2 ? Math.min(256, Math.trunc(rawMaxWordLen)) : DEFAULT_SETTINGS.maxWordLen,
    factors: timingFactors(raw.factors),
    comfort: comfortSettings(storedVersion >= 3 ? raw.comfort : undefined),
    position: position(raw.position),
    autoRewindOnResume: booleanValue(raw.autoRewindOnResume, DEFAULT_SETTINGS.autoRewindOnResume),
    hideControlsWhilePlaying: booleanValue(
      raw.hideControlsWhilePlaying,
      DEFAULT_SETTINGS.hideControlsWhilePlaying,
    ),
  };
}

function syncStorage(): SettingsStorageArea {
  const area = (globalThis as ChromeStorageGlobal).chrome?.storage?.sync;
  if (area === undefined) throw new Error('chrome.storage.sync is unavailable');
  return area;
}

export function settingsStorageAvailable(): boolean {
  return (globalThis as ChromeStorageGlobal).chrome?.storage?.sync !== undefined;
}

export async function loadSettings(storage: SettingsStorageArea = syncStorage()): Promise<Settings> {
  const stored = await storage.get(STORAGE_KEY);
  return migrate(stored[STORAGE_KEY]);
}

export async function saveSettings(
  value: unknown,
  storage: SettingsStorageArea = syncStorage(),
): Promise<Settings> {
  const settings = migrate(value);
  await storage.set({ [STORAGE_KEY]: settings });
  return settings;
}
