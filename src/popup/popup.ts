import { isStillpointMessage, type StillpointMessage } from '../shared/messages.js';
import { loadSettings, saveSettings } from '../shared/settings.js';
import type { Settings } from '../shared/types.js';

interface PopupTab {
  id?: number;
}

interface PopupChrome {
  tabs: {
    query: (query: { active: true; currentWindow: true }) => Promise<PopupTab[]>;
    sendMessage: (tabId: number, message: StillpointMessage) => Promise<unknown>;
  };
}

function chromeApi(): PopupChrome {
  return (globalThis as unknown as { chrome: PopupChrome }).chrome;
}

function requiredElement<T extends HTMLElement>(id: string, constructor: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing popup element: ${id}`);
  return element;
}

const wpm = requiredElement('wpm', HTMLInputElement);
const wpmValue = requiredElement('wpm-value', HTMLOutputElement);
const theme = requiredElement('theme', HTMLSelectElement);
const fontSize = requiredElement('font-size', HTMLSelectElement);

function render(settings: Settings): void {
  wpm.value = settings.wpm.toString();
  wpmValue.value = `${settings.wpm} WPM`;
  theme.value = settings.theme;
  fontSize.value = settings.fontSize.toString();
}

async function notifyReader(settings: Settings): Promise<void> {
  const [tab] = await chromeApi().tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const message: StillpointMessage = { kind: 'settings-changed', settings };
  if (!isStillpointMessage(message)) return;
  try {
    await chromeApi().tabs.sendMessage(tab.id, message);
  } catch {
    // SPEC §1.3
  }
}

async function update(patch: Partial<Pick<Settings, 'wpm' | 'theme' | 'fontSize'>>): Promise<void> {
  const current = await loadSettings();
  const settings = await saveSettings({ ...current, ...patch });
  render(settings);
  await notifyReader(settings);
}

wpm.addEventListener('input', () => {
  const value = wpm.valueAsNumber;
  if (Number.isFinite(value)) void update({ wpm: value });
});

theme.addEventListener('change', () => {
  if (theme.value === 'auto' || theme.value === 'light' || theme.value === 'dark') {
    void update({ theme: theme.value });
  }
});

fontSize.addEventListener('change', () => {
  const value = Number(fontSize.value);
  if (value === 20 || value === 28 || value === 36 || value === 48) void update({ fontSize: value });
});

void loadSettings().then(render);
