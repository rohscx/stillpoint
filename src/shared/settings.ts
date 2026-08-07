import { DEFAULT_SETTINGS, type Settings, type TimingFactors } from './types.js';

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
  return candidate > 0 ? candidate : fallback;
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
  };
}

// SPEC §5.3
export function migrate(value: unknown): Settings {
  const raw = record(value) ?? {};
  const rawMaxWordLen = finiteNumber(raw.maxWordLen, DEFAULT_SETTINGS.maxWordLen);
  const theme = raw.theme === 'auto' || raw.theme === 'light' || raw.theme === 'dark'
    ? raw.theme
    : DEFAULT_SETTINGS.theme;

  return {
    version: 1,
    wpm: clamp(finiteNumber(raw.wpm, DEFAULT_SETTINGS.wpm), 150, 1_000),
    fontSize: fontSize(raw.fontSize),
    theme,
    maxWordLen: rawMaxWordLen >= 2 ? Math.trunc(rawMaxWordLen) : DEFAULT_SETTINGS.maxWordLen,
    factors: timingFactors(raw.factors),
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
