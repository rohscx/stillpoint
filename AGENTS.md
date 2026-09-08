# Working on Stillpoint

An RSVP speed reader (Spritz-style: one word at a time, red ORP letter, fixed Redicle)
shipped as a Manifest V3 Chromium extension. Published on the Chrome Web Store.

**`SPEC.md` is the contract.** It is normative, not documentation. When a decision changes
behaviour, change `SPEC.md` in the same commit and say why. Several sections carry a note
explaining what was tried and why it was wrong — keep that habit; it is the reason the same
mistakes have not recurred.

## The gate

Everything must pass before a commit:

```bash
npm run typecheck && npm test && npm run test:e2e && npm run build && npm run audit:budget
```

`npm run package` builds the deterministic store zip. `npm run screenshots` regenerates
store images from the real product.

## Invariants

These have each been broken at least once and caught by a test or by looking. Do not
regress them.

- **The engine is pure.** Nothing under `src/reader/engine/` may reference `document`,
  `window`, or `chrome`. `tsconfig` omits the `DOM` lib so this fails to compile.
- **`Scheduler` holds no code-block state.** Code blocks expand to one token per line at
  tokenise time precisely so the scheduler needs no changes (SPEC §2.6).
- **No layout measurement in the per-tick render path.** No `getBoundingClientRect`,
  `offsetWidth` or `getComputedStyle` while rendering a word. Measuring during a drag
  gesture or inside a `ResizeObserver` is fine. The perf spec asserts zero forced layout
  per tick and fails loudly.
- **No `requestAnimationFrame`.** The display changes only on a tick (SPEC §2.3).
- **The ORP glyph stays within 0.5 px of the hash mark**, achieved with monospace `1ch`
  cells and zero JS measurement. This is the product. The alignment spec covers four font
  sizes, both themes, a moved Redicle, and after a code block.
- **Extraction touches a clone, never the live document**, and `clean.ts` must never alter
  code-block content — its rules strip `[1]` and punctuation runs, which corrupts source.
- **`migrate()` returns valid `Settings` for arbitrary stored input** — `null`, partial,
  future version, wrong types, hostile numbers. It is the only guard against a stale
  synced object breaking the reader.
- **Store posture**: exactly four permissions (`activeTab`, `scripting`, `storage`,
  `contextMenus`), no `host_permissions`, no `content_scripts`, no remote code. These are
  asserted in a live store listing. If a change seems to need a permission, stop and say so.
- **Version**: `package.json` is the single source of truth; `build.mjs` writes it into
  `dist/manifest.json` and `audit:budget` exits non-zero if they drift. The repo
  `manifest.json` carries a `0.0.0` placeholder.

## Conventions

TypeScript strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. ESM.
Named exports only. No `any`, no non-null assertions. Comments cite `// SPEC §x.y` rather
than restating the rule, and stay sparse — the code favours self-describing names over
narration. Match the surrounding file.

## Environment realities

- **Codex has no network.** `npm install` fails, and web lookups are impossible. If a task
  needs a package or a source, say so rather than working around it.
- **Playwright's fixture server often cannot bind** in the sandbox. When that happens,
  report the e2e suite as unrun. Do not stub, skip, or weaken a spec to produce a green
  result — an honest "blocked" is worth more, and the specs get run outside the sandbox.
- **Never weaken an assertion to make something pass.** If an existing test encodes
  behaviour a change must alter, call that out explicitly.

## Layout

```
src/reader/engine/   pure engine: tokenize, orp, timing, scheduler, comfort
src/reader/ui/       Redicle, controls, settings, drag, paste, keyboard
src/reader/extract/  selection / Readability / heuristic, all on a clone
src/shared/          types, settings + migrate, messages, version
src/sw.ts            MV3 service worker: no module-scope state, listeners registered sync
tools/               icons, deterministic zip, budget audit
store/               listing copy, privacy text, screenshot generator
docs/                design explorations and demos, not shipped
```

## When reporting back

State what you verified and what you did not. Give per-item outcomes — fixed, refuted with
reasoning, or deferred with reasoning. Refuting a bad finding is more useful than
implementing it. If you think something is a bad idea, say so.
