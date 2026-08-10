import type { Block } from '../../shared/types.js';

function languageFrom(element: Element): string | undefined {
  const classes = element.getAttribute('class')?.split(/\s+/u) ?? [];
  for (const className of classes) {
    const match = className.match(/^(?:language|lang)-(.+)$/u);
    if (match?.[1] !== undefined && match[1] !== '') return match[1];
  }
  return undefined;
}

// SPEC §4
export function codeBlock(element: Element): Block {
  const code = element.querySelector(':scope > code');
  const source = code ?? element;
  const lines = (source.textContent ?? '').replace(/\r\n?/gu, '\n').split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  const lang = languageFrom(source) ?? languageFrom(element);
  return lang === undefined
    ? { kind: 'code', lines }
    : { kind: 'code', lines, lang };
}
