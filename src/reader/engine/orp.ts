const LEADING_PUNCTUATION = /^["'“‘«‹([{（［｛]+/u;

export function orpIndex(displayLength: number): number {
  if (!Number.isFinite(displayLength) || displayLength <= 1) return 0;
  if (displayLength <= 5) return 1;
  if (displayLength <= 9) return 2;
  if (displayLength <= 13) return 3;
  return 4;
}

export function orpIndexForText(text: string): number {
  const glyphs = Array.from(text);
  if (glyphs.length === 0) return 0;
  const leading = text.match(LEADING_PUNCTUATION)?.[0];
  const leadingLength = leading === undefined ? 0 : Array.from(leading).length;

  // SPEC §2.2
  return Math.min(glyphs.length - 1, leadingLength + orpIndex(glyphs.length - leadingLength));
}
