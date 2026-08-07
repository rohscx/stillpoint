import { cleanExtractedText } from './clean.js';

const MIN_ARTICLE_LENGTH = 200;

interface ReadabilityModule {
  extractReadableText: (documentRoot: Document) => string;
}

interface HeuristicModule {
  extractHeuristically: (documentRoot: Document) => string;
}

export interface AcquisitionResult {
  source: 'selection' | 'readability' | 'heuristic' | 'paste';
  text: string;
}

interface ChromeRuntime {
  runtime?: { getURL?: (path: string) => string };
}

function lazyChunkUrl(documentRoot: Document, filename: string): string {
  const chromeRuntime = (globalThis as typeof globalThis & { chrome?: ChromeRuntime }).chrome;
  return chromeRuntime?.runtime?.getURL?.(filename)
    ?? new URL(`/dist/${filename}`, documentRoot.location.href).href;
}

async function loadReadability(documentRoot: Document): Promise<ReadabilityModule> {
  const url = lazyChunkUrl(documentRoot, 'extract.js');
  return import(/* @vite-ignore */ url) as Promise<ReadabilityModule>;
}

async function loadHeuristic(documentRoot: Document): Promise<HeuristicModule> {
  const url = lazyChunkUrl(documentRoot, 'heuristic.js');
  return import(/* @vite-ignore */ url) as Promise<HeuristicModule>;
}

// Exact resolution order from SPEC §4. The selection return precedes the dynamic import.
export async function acquireText(
  documentRoot: Document = document,
  selectedText: string = documentRoot.defaultView?.getSelection()?.toString() ?? '',
): Promise<AcquisitionResult> {
  if (selectedText.trim() !== '') {
    return { source: 'selection', text: cleanExtractedText(selectedText) };
  }

  try {
    const readability = await loadReadability(documentRoot);
    const readableText = cleanExtractedText(readability.extractReadableText(documentRoot));
    if (readableText.length >= MIN_ARTICLE_LENGTH) {
      return { source: 'readability', text: readableText };
    }
  } catch {
    // A blocked/missing lazy resource degrades to the local fallback (SPEC §4).
  }

  try {
    const heuristic = await loadHeuristic(documentRoot);
    const heuristicText = cleanExtractedText(heuristic.extractHeuristically(documentRoot));
    if (heuristicText.length >= MIN_ARTICLE_LENGTH) {
      return { source: 'heuristic', text: heuristicText };
    }
  } catch {
    // If both web-accessible resources are unavailable, paste remains usable.
  }
  return { source: 'paste', text: '' };
}
