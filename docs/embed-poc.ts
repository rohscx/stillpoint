/** Exploration adapter, not a published library. Actual engine, Redicle and CSS from src/. */
import { tokenize, unsupportedScript } from '../src/reader/engine/tokenize.js';
import { Scheduler } from '../src/reader/engine/scheduler.js';
import { Overlay } from '../src/reader/ui/overlay.js';
import { Redicle } from '../src/reader/ui/redicle.js';

export function createReader() {
  let dispose: (() => void) | undefined;
  return {
    open({ text, title = 'Stillpoint reader' }: { text: string; title?: string }) {
      if (typeof text !== 'string' || !text.trim() || text.length > 200_000) {
        throw new TypeError('Supply 1–200,000 characters of plain text.');
      }
      if (unsupportedScript(text)) throw new TypeError('This prototype supports Latin-script prose.');
      // Validate/tokenise before replacing a working reader.
      const tokens = tokenize(text);
      dispose?.();
      const overlay = new Overlay('light', 36);
      const redicle = new Redicle(document);
      const scheduler = new Scheduler(tokens);
      const { reader, fullText, host, shadowRoot } = overlay.elements;
      host.setAttribute('aria-label', title);
      fullText.textContent = text;
      const heading = document.createElement('h2');
      heading.textContent = title;
      heading.style.cssText = 'font:600 16px system-ui;margin:0 0 16px;color:var(--sp-fg)';
      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;font:14px system-ui;margin-top:18px';
      // Same glyph set and accessible names as the extension's transport (SPEC §3.4), so an
      // embedded reader is recognisably the same control surface.
      const button = (label: string, glyph: string, action: () => void) => {
        const node = document.createElement('button');
        node.type = 'button'; node.textContent = glyph;
        node.setAttribute('aria-label', label);
        node.style.cssText = 'font:inherit;min-width:30px;padding:4px 6px;cursor:pointer;'
          + 'color:var(--sp-ui);background:var(--sp-bg);border:1px solid var(--sp-rule);border-radius:4px';
        node.onclick = action; controls.append(node); return node;
      };
      const toggle = () => {
        if (scheduler.isPlaying) scheduler.pause(); else scheduler.play();
        play.setAttribute('aria-label', scheduler.isPlaying ? 'Pause' : 'Play');
      };
      button('Previous paragraph', '⏮', () => scheduler.seekParagraph(-1));
      button('Previous word', '◀', () => scheduler.seekWord(-1));
      const play = button('Pause', '⏯', toggle);
      button('Next word', '▶', () => scheduler.seekWord(1));
      button('Next paragraph', '⏭', () => scheduler.seekParagraph(1));
      const close = () => {
        scheduler.pause(); redicle.destroy();
        document.removeEventListener('visibilitychange', hidden);
        shadowRoot.removeEventListener('keydown', key, true);
        overlay.close(); dispose = undefined;
      };
      button('Close reader', '✕', close);
      const progress = document.createElement('span');
      controls.append(progress);
      const hidden = () => { if (document.hidden) scheduler.pause(); };
      const key: EventListener = (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
        if (event.key === 'Escape' || event.key === ' ') {
          event.preventDefault(); event.stopPropagation();
          if (event.repeat) return;
          if (event.key === 'Escape') close(); else toggle();
        }
      };
      scheduler.on('tick', (token, index) => {
        redicle.render(token); progress.textContent = `${index + 1} / ${tokens.length} · 350 WPM`;
      });
      scheduler.on('paused', () => { play.textContent = 'Play'; });
      scheduler.on('finished', () => { play.textContent = 'Read again'; });
      reader.append(heading, redicle.element, controls);
      // POC-only responsive sizing; the real Redicle geometry and rendering are unchanged.
      reader.style.width = 'min(720px, calc(100vw - 32px))';
      shadowRoot.addEventListener('keydown', key, true);
      document.addEventListener('visibilitychange', hidden);
      dispose = close;
      overlay.focus(); scheduler.play();
    },
    close() { dispose?.(); },
    destroy() { dispose?.(); },
  };
}

export type TriggerVariant = 'mark' | 'letter';

export interface TriggerOptions {
  title: string;
  text: string;
  /** 'mark' (default) is the compact Redicle glyph; 'letter' shows a word with its ORP. */
  variant?: TriggerVariant;
  label?: string;
}

// The library supplies markup, the accessible name and a 44px target; the host supplies
// the skin. Both marks draw in currentColor so they inherit whatever the host styles.
const MARKS: Record<TriggerVariant, string> = {
  mark:
    '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">'
    + '<rect x="3" y="7.5" width="26" height="2" rx="1" fill="currentColor" opacity=".55"/>'
    + '<rect x="3" y="22.5" width="26" height="2" rx="1" fill="currentColor" opacity=".55"/>'
    + '<rect x="13.2" y="11.5" width="5.6" height="9" rx="1.4" fill="#d0021b"/></svg>',
  letter:
    '<svg viewBox="0 0 44 32" width="34" height="25" aria-hidden="true" focusable="false">'
    + '<text x="22" y="23" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" '
    + 'font-size="19" font-weight="600" fill="currentColor">r<tspan fill="#d0021b">e</tspan>ad</text></svg>',
};

/**
 * Builds a trigger button for one article and binds it to a reader. The button carries its
 * own accessible name and hit target because an icon-only control has neither by default.
 */
export function createTrigger(
  reader: { open: (article: { title: string; text: string }) => void },
  options: TriggerOptions,
): HTMLButtonElement {
  const variant = options.variant ?? 'mark';
  const label = options.label ?? 'Read with Stillpoint';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `stillpoint-trigger stillpoint-trigger--${variant}`;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = MARKS[variant];
  // WCAG 2.5.8: an icon-only control still needs a real target.
  // Layout and hit target only. Deliberately no colour: both marks draw in currentColor,
  // so the host's stylesheet decides, and an inline colour here would outrank it.
  button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
    + 'min-width:44px;min-height:44px;padding:7px;cursor:pointer';
  button.addEventListener('click', () => reader.open({ title: options.title, text: options.text }));
  return button;
}
