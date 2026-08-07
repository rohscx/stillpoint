import { isStillpointMessage } from './shared/messages.js';

const SELECTION_MENU_ID = 'stillpoint-read-selection';
const PAGE_MENU_ID = 'stillpoint-read-page';
const INJECTION_ERROR_TITLE = "Stillpoint can't read this page";

interface Tab {
  id?: number;
}

interface ChromeServiceWorker {
  action: {
    onClicked: { addListener: (listener: (tab: Tab) => void) => void };
    setBadgeText: (details: { tabId: number; text: string }) => Promise<void>;
    setTitle: (details: { tabId: number; title: string }) => Promise<void>;
  };
  commands: {
    onCommand: { addListener: (listener: (command: string) => void) => void };
  };
  contextMenus: {
    onClicked: { addListener: (listener: (info: { menuItemId: string | number }, tab?: Tab) => void) => void };
    removeAll: (callback: () => void) => void;
    create: (properties: { id: string; title: string; contexts: string[] }) => void;
  };
  runtime: {
    onInstalled: { addListener: (listener: () => void) => void };
    onMessage: { addListener: (listener: (message: unknown) => void) => void };
  };
  scripting: {
    executeScript: (details: {
      target: { tabId: number };
      files: string[];
      world: 'ISOLATED';
    }) => Promise<unknown>;
  };
  tabs: {
    query: (query: { active: true; currentWindow: true }) => Promise<Tab[]>;
  };
}

function chromeApi(): ChromeServiceWorker {
  return (globalThis as unknown as { chrome: ChromeServiceWorker }).chrome;
}

async function showInjectionError(tabId: number): Promise<void> {
  const api = chromeApi();
  await Promise.all([
    api.action.setBadgeText({ tabId, text: '!' }),
    api.action.setTitle({ tabId, title: INJECTION_ERROR_TITLE }),
  ]);
}

async function clearInjectionError(tabId: number): Promise<void> {
  const api = chromeApi();
  await Promise.all([
    api.action.setBadgeText({ tabId, text: '' }),
    api.action.setTitle({ tabId, title: 'Stillpoint' }),
  ]);
}

async function inject(tabId: number): Promise<void> {
  try {
    await chromeApi().scripting.executeScript({
      target: { tabId },
      files: ['reader.iife.js'],
      world: 'ISOLATED',
    });
    await clearInjectionError(tabId);
  } catch {
    await showInjectionError(tabId);
  }
}

async function injectActiveTab(): Promise<void> {
  const [tab] = await chromeApi().tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await inject(tab.id);
}

// SPEC §5.1
chromeApi().action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void inject(tab.id);
});

chromeApi().commands.onCommand.addListener((command) => {
  if (command === 'open-reader') void injectActiveTab();
});

chromeApi().contextMenus.onClicked.addListener((info, tab) => {
  if ((info.menuItemId === SELECTION_MENU_ID || info.menuItemId === PAGE_MENU_ID) && tab?.id !== undefined) {
    void inject(tab.id);
  }
});

chromeApi().runtime.onMessage.addListener((message) => {
  if (isStillpointMessage(message) && message.kind === 'open') void injectActiveTab();
});

chromeApi().runtime.onInstalled.addListener(() => {
  chromeApi().contextMenus.removeAll(() => {
    chromeApi().contextMenus.create({
      id: SELECTION_MENU_ID,
      title: 'Read with Stillpoint',
      contexts: ['selection'],
    });
    chromeApi().contextMenus.create({
      id: PAGE_MENU_ID,
      title: 'Read this page with Stillpoint',
      contexts: ['page'],
    });
  });
});
