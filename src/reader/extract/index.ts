import { codeBlock, collectBlocks } from './blocks.js';
import { cleanExtractedText } from './clean.js';
import type { Block } from '../../shared/types.js';

const MIN_ARTICLE_LENGTH = 200;

interface ReadabilityModule {
  extractReadableText: (documentRoot: Document) => Block[];
}

interface HeuristicModule {
  extractHeuristically: (documentRoot: Document) => Block[];
}

export interface AcquisitionResult {
  source: 'selection' | 'readability' | 'heuristic' | 'paste';
  blocks: Block[];
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
    const selection = documentRoot.defaultView?.getSelection();
    if (selection !== null && selection !== undefined && selection.rangeCount > 0
      && selection.toString() === selectedText) {
      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      const element = ancestor.nodeType === 1 ? ancestor as Element : ancestor.parentElement;
      const pre = element?.closest('pre');
      const fragment = range.cloneContents();
      if (pre != null) {
        const context = codeBlock(pre);
        const wrapper = pre.cloneNode(false) as Element;
        wrapper.append(fragment);
        const selected = codeBlock(wrapper);
        if (selected.kind === 'code' && context.kind === 'code' && context.lang !== undefined) {
          selected.lang = context.lang;
        }
        return { source: 'selection', blocks: [selected] };
      }
      if (fragment.querySelector('pre') !== null) {
        return { source: 'selection', blocks: cleanBlocks(collectBlocks(fragment)) };
      }
    }
    return { source: 'selection', blocks: [{ kind: 'text', text: cleanExtractedText(selectedText) }] };
  }

  try {
    const readability = await loadReadability(documentRoot);
    const readableBlocks = cleanBlocks(readability.extractReadableText(documentRoot));
    if (blockLength(readableBlocks) >= MIN_ARTICLE_LENGTH) {
      return { source: 'readability', blocks: readableBlocks };
    }
  } catch {
    // A blocked/missing lazy resource degrades to the local fallback (SPEC §4).
  }

  try {
    const heuristic = await loadHeuristic(documentRoot);
    const heuristicBlocks = cleanBlocks(heuristic.extractHeuristically(documentRoot));
    if (blockLength(heuristicBlocks) >= MIN_ARTICLE_LENGTH) {
      return { source: 'heuristic', blocks: heuristicBlocks };
    }
  } catch {
    // If both web-accessible resources are unavailable, paste remains usable.
  }
  return { source: 'paste', blocks: [] };
}

function cleanBlocks(blocks: readonly Block[]): Block[] {
  return blocks.flatMap((block): Block[] => {
    if (block.kind === 'code') return [block];
    const text = cleanExtractedText(block.text);
    return text === '' ? [] : [{ kind: 'text', text }];
  });
}

function blockLength(blocks: readonly Block[]): number {
  return blocks.reduce((total, block) => total + (
    block.kind === 'text' ? block.text.length : block.lines.reduce((sum, line) => sum + line.length, 0)
  ), 0);
}
