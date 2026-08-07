import type { Settings, TimingFactors } from './types.js';

export type StillpointMessage =
  | { kind: 'open' }
  | { kind: 'settings-changed'; settings: Settings }
  | { kind: 'close' };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFactors(value: unknown): value is TimingFactors {
  const factors = record(value);
  return factors !== undefined
    && isPositiveNumber(factors.sentence)
    && isPositiveNumber(factors.clause)
    && isPositiveNumber(factors.paragraph)
    && isPositiveNumber(factors.longWord)
    && isPositiveNumber(factors.numeric)
    && isPositiveNumber(factors.paraStart);
}

function isSettings(value: unknown): value is Settings {
  const settings = record(value);
  return settings !== undefined
    && settings.version === 1
    && isFiniteNumber(settings.wpm)
    && settings.wpm >= 150
    && settings.wpm <= 1_000
    && (settings.fontSize === 20 || settings.fontSize === 28 || settings.fontSize === 36 || settings.fontSize === 48)
    && (settings.theme === 'auto' || settings.theme === 'light' || settings.theme === 'dark')
    && isFiniteNumber(settings.maxWordLen)
    && Number.isInteger(settings.maxWordLen)
    && settings.maxWordLen >= 2
    && isFactors(settings.factors)
    && typeof settings.autoRewindOnResume === 'boolean'
    && typeof settings.hideControlsWhilePlaying === 'boolean';
}

// SPEC §6
export function isStillpointMessage(value: unknown): value is StillpointMessage {
  const message = record(value);
  if (message === undefined) return false;
  if (message.kind === 'open' || message.kind === 'close') return true;
  return message.kind === 'settings-changed' && isSettings(message.settings);
}
