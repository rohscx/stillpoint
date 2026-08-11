interface RuntimeGlobal {
  chrome?: { runtime?: { getManifest?: () => { version?: string } } };
}

/**
 * The loaded extension's version, or undefined outside an extension context — the
 * Playwright fixtures mount the reader as a plain module, where there is no manifest to
 * read. Callers omit the line rather than printing a placeholder: "Stillpoint unavailable"
 * reads as though the extension were broken, when only the number is missing.
 *
 * SPEC §8a.
 */
export function extensionVersion(): string | undefined {
  try {
    return (globalThis as RuntimeGlobal).chrome?.runtime?.getManifest?.().version;
  } catch {
    return undefined;
  }
}
