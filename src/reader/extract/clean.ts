const REPEATED_PUNCTUATION = /([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~…—–])\1{2,}/gu;
const FOOTNOTE_MARKER = /\[\d+\]/gu;
const IMAGE_CREDIT = /^(?:(?:image|photo|illustration|graphic)\s+(?:credit|credits|courtesy|by)|credit\s*:|©\s*\S)/iu;

// SPEC §4
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/gu, '\n')
    .split(/\n[\t ]*\n+/u)
    .map((paragraph) => paragraph
      .replace(REPEATED_PUNCTUATION, '')
      .replace(FOOTNOTE_MARKER, '')
      .trim())
    .filter((paragraph) => paragraph !== '' && !IMAGE_CREDIT.test(paragraph))
    .join('\n\n');
}
