# Stillpoint — Specification v1.0

A Chromium browser extension that reproduces the reading experience of the defunct
**Spritz** reader (RSVP + ORP "Redicle") on any web page.

Status: design spec, pre-implementation. This document is the contract for the build.

---

## 1. Product definition

### 1.1 What Spritz was

Spritz (spritzinc.com, announced Feb 2014, now defunct) presented text one word at a
time at a fixed screen location — **Rapid Serial Visual Presentation (RSVP)** — with two
additions that distinguished it from every other RSVP reader:

1. **ORP (Optimal Recognition Point).** One letter of each word, slightly left of centre,
   is rendered in red. This is the position the eye naturally fixates to recognise a word
   fastest. Every word is horizontally offset so that its ORP letter lands on the **same
   pixel column** every frame. The eye therefore never moves.
2. **The Redicle.** The display frame: a bounded box with a horizontal rule above and
   below the word, and short vertical hash marks descending from the top rule and
   ascending from the bottom rule, both aligned exactly on the ORP column. The hash marks
   are the visual anchor that trains the eye to hold still.

Everything else about the experience — the near-total absence of chrome, the instant
start, the fact that it never reflows — follows from those two ideas.

### 1.2 What Stillpoint must be

A faithful clone of that experience, delivered as a Manifest V3 extension for Chromium
browsers (Chrome, Edge, Brave, Arc, Vivaldi). It reads:

- the user's current text selection, or
- the main article content of the current page, or
- arbitrary pasted text.

Non-goals for v1: Firefox/Safari ports, PDF reading, EPUB, sync of reading position
across devices, accounts, telemetry, any network calls whatsoever.

### 1.3 Hard constraints

| Constraint | Budget |
|---|---|
| Total unpacked extension size | ≤ 250 KB |
| Injected runtime (gzipped) | ≤ 45 KB core, Readability lazy chunk ≤ 30 KB |
| Cost when the reader is closed | **zero** — no content script, no listeners, no memory |
| Main-thread work per word tick | ≤ 2 ms |
| Timing drift over 10 minutes at 600 WPM | ≤ 250 ms |
| Network requests at runtime | 0 |
| Permissions | `activeTab`, `scripting`, `storage`, `contextMenus` — **no `host_permissions`** |

The zero-idle-cost rule is the reason there is no declarative `content_scripts` entry.
The reader is injected on demand via `chrome.scripting.executeScript` under `activeTab`.
This also means the extension has no ambient read access to the user's browsing.

---

## 2. The reading engine

This section is normative. Deviations change the feel of the product.

### 2.1 Tokenisation

Input is a plain-text string produced by the extractor (§4). Produce an ordered array of
`Token` objects.

```ts
interface Token {
  text:        string;   // the glyphs to display, after any hyphenation split
  orp:         number;   // 0-based index into text of the ORP character
  delayFactor: number;   // multiplier applied to the base word duration
  sentenceIdx: number;   // for sentence-level rewind
  paraIdx:     number;   // for paragraph-level navigation
  sourceIdx:   number;   // character offset into the original text, for progress
}
```

Rules, applied in order:

1. Normalise whitespace: collapse runs of spaces/tabs; treat one or more blank lines as a
   **paragraph break**; convert non-breaking spaces to spaces; normalise Unicode to NFC.
2. Split on whitespace. Retain attached punctuation on the token — punctuation is
   displayed, and it drives timing.
3. **Hyphenation of long tokens.** A token whose displayed length exceeds
   `MAX_WORD_LEN` (default 13) is split into chunks of at most `MAX_WORD_LEN - 1`
   characters. All chunks except the last get a trailing `-` appended to `text`. Split at
   a vowel/consonant boundary when one exists in the last 3 candidate positions,
   otherwise split hard. Each chunk is a full token and consumes its own tick. This
   mirrors Spritz's behaviour and keeps the ORP column meaningful for long words.
4. Compute `orp` per §2.2, `delayFactor` per §2.3.

Edge cases that must be handled explicitly: URLs and email addresses (treat as a single
token, hyphenate as above, do not split on `.` or `/`); numbers with separators
(`1,234.56` is one token, no comma pause); ellipses (`…` and `...` take the
sentence-end pause); em dashes surrounded by spaces (own token, comma-class pause);
quotation marks and brackets (ignored when determining trailing punctuation class, i.e.
`word."` is still a sentence end); CJK text (see §2.5).

### 2.2 ORP selection — normative table

The ORP index is a pure function of the token's **display length** (glyph count after
hyphenation, counting the trailing hyphen). 1-indexed positions, as in the original:

| Display length | ORP position (1-indexed) | `orp` (0-indexed) |
|---|---|---|
| 1 | 1 | 0 |
| 2–5 | 2 | 1 |
| 6–9 | 3 | 2 |
| 10–13 | 4 | 3 |
| 14+ | 5 | 4 |

```ts
function orpIndex(len: number): number {
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}
```

Leading punctuation (an opening quote or bracket) is **excluded** from the length used
for this lookup, and the resulting index is then shifted right by the number of leading
punctuation characters. Trailing punctuation **is** included in the length. This is what
keeps `"Hello,` and `Hello` visually aligned on the same letter.

Note: this table is the widely reproduced Spritz rule and matches the independent
reimplementations `tspreed` and `speedread`. Do not substitute a "one third of the word"
formula — it produces visibly different, worse alignment on short words.

### 2.3 Timing model

Base duration for one token:

```
base_ms = 60000 / wpm
```

The final duration is `base_ms * delayFactor`, where `delayFactor` is the product of the
applicable factors below. All factors are user-tunable in Advanced settings; the defaults
are what ship.

| Condition (evaluated on the token) | Default factor |
|---|---|
| Baseline | 1.0 |
| Ends a sentence: trailing `.` `!` `?` `…` (ignoring closing quotes/brackets) | ×2.5 |
| Ends a clause: trailing `,` `;` `:` `—` | ×1.8 |
| Ends a paragraph (in addition to the sentence factor) | ×1.4 |
| Display length > 8 | ×(1 + (len − 8) × 0.05), capped at ×1.5 |
| Contains a digit | ×1.4 |
| Is the first token of a new paragraph | ×1.2 |

Additional rules:

- **Start/resume floor.** The first token after `play()` from a stopped or paused state
  is displayed for at least 400 ms regardless of WPM, so the eye can acquire the reticle.
- **Absolute-deadline scheduling.** Do not chain `setTimeout(fn, duration)` — the errors
  accumulate. Maintain an absolute `nextDeadline` timestamp:

  ```ts
  nextDeadline += duration;
  setTimeout(tick, Math.max(0, nextDeadline - performance.now()));
  ```

  If the tab was backgrounded and `performance.now()` has overshot by more than one
  `base_ms`, **do not** burn through the backlog — resync `nextDeadline` to now and, if
  the overshoot exceeded 2 s, auto-pause. Chrome throttles timers in background tabs to
  ≥1 s; the reader must pause cleanly rather than skip a page of text.
- No `requestAnimationFrame` loop. The display changes only on a tick; a rAF loop would
  burn battery for nothing.

### 2.4 WPM range

150–1000 WPM. Default 350. Step 25 for keyboard adjust, 5 for the slider. The slider step
**must divide the keyboard step**: a step of 10 cannot represent 375, so an `<input
type=range>` coerces it to 380 and the control silently disagrees with the engine's actual
WPM. Values persist
per-user via `chrome.storage.sync`. The original marketed 250–1000; 150 is included as an
accessibility floor.

### 2.5 CJK and non-Latin text

For scripts without spaces (Han, Hiragana, Katakana), whitespace splitting yields useless
tokens. v1 behaviour: if a paragraph contains >30% CJK codepoints, chunk it into
fixed-size groups of 2 characters with `orp = 0`, and apply timing at 0.6× the base
duration (CJK carries more meaning per glyph). Do not attempt morphological segmentation.
RTL scripts (Arabic, Hebrew): mirror the layout — ORP column at 62% from the left, `dir`
set on the container. If either is too costly, ship v1 Latin-only and gate on a script
detection that shows a clear "unsupported script" message rather than garbage.

---

## 3. Visual design — the Redicle

Reproduce this precisely. The whole product is this component.

### 3.1 Geometry

The reader is a fixed-position overlay, horizontally centred, vertically at 38% of the
viewport height (above centre — this is where Spritz sat, and it matters; dead-centre
feels wrong).

```
        ┌──────────────────────────────────────┐
        │                 │                    │   ← top rule + descending hash mark
        │                                      │
        │        rea[d]ing                     │   ← word, [d] is the red ORP glyph
        │                                      │
        │                 │                    │   ← bottom rule + ascending hash mark
        └──────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Frame width | 32 `ch` of the reading font (≈ fits 30 glyphs), min 320 px, max 720 px |
| Frame height | 5.5 × font line-height |
| ORP column | at **35%** of the frame's inner width, measured to the centre of the glyph cell |
| Top/bottom rules | 1 px, full inner width, `--sp-rule` colour |
| Hash marks | 1 px wide, length = 0.45 × font-size, vertically flush against the rules, horizontally centred on the ORP column |
| Word baseline | vertically centred between the rules |
| Frame corners | 4 px radius |
| Frame padding | 0.75 × font-size vertical, 1 `ch` horizontal |

**The alignment mechanism.** The reading font is monospace, so every glyph cell is
exactly `1ch` wide. Render the word as three inline spans — `pre` (before ORP), `orp`
(one glyph), `post` — inside a container that is absolutely positioned such that the
centre of the `orp` span sits on the ORP column:

```css
.sp-word {
  position: absolute;
  left: 35%;
  transform: translateX(-0.5ch);   /* centre the ORP glyph cell on the column */
  white-space: pre;
}
.sp-word .sp-pre { position: absolute; right: 100%; }  /* grows leftward */
.sp-word .sp-post { position: absolute; left: 100%; }  /* grows rightward */
```

This yields pixel-exact alignment with **no per-word measurement, no layout thrash, and
no JS width computation**. Do not implement alignment by padding with invisible dots
(the OpenSpritz approach) — it is fragile and reflows.

### 3.2 Typography

- Font stack: `ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace`.
  Monospace is a hard requirement of the alignment mechanism above.
- Size: user setting, 20 / 28 / 36 / 48 px (S/M/L/XL), default 36 px.
- Weight 400. Letter-spacing 0. No ligatures (`font-variant-ligatures: none`) — ligatures
  break the 1ch cell assumption.
- `font-kerning: none`, `font-feature-settings: "tnum"`.

### 3.3 Colour

Two themes, following the page's `prefers-color-scheme` by default, user-overridable.

| Token | Light | Dark |
|---|---|---|
| `--sp-bg` (frame) | `#FAF9F7` | `#16181C` |
| `--sp-fg` (word) | `#1A1A1A` | `#E8E6E3` |
| `--sp-orp` (ORP glyph) | `#D0021B` | `#FF4A4A` |
| `--sp-rule` (rules, hash marks) | `#C9C6C1` | `#3A3D42` |
| `--sp-scrim` (page backdrop) | `rgba(250,249,247,0.94)` | `rgba(12,13,15,0.94)` |
| `--sp-ui` (controls, dimmed) | `#8A8783` | `#6E7278` |

The ORP red is the signature. Do not soften it, do not animate it, do not add a glow.

### 3.4 Chrome and controls

Below the Redicle, in `--sp-ui` at 13 px:

- A progress bar: 2 px, full frame width, filled proportion = tokens consumed / total.
- A single line: `‹wpm› WPM · ‹n› / ‹total› words · ‹mm:ss› left`.
- On hover or when paused, reveal: ⏮ paragraph · ◀ word · ⏯ · word ▶ · paragraph ⏭,
  a WPM slider, a settings gear, and a close ✕.

When playing and the mouse is idle for 1.5 s, controls fade to 0 opacity over 400 ms.
Nothing but the Redicle and progress bar remains. **No animation of any kind inside the
Redicle** — no fades, no transitions on the word, no cursor. The word swaps instantly.
This is not negotiable; transitions destroy the RSVP effect.

The rest of the page is covered by `--sp-scrim` (a backdrop, not a blur — blur is
expensive and causes compositor jank on large pages).

### 3.5 Isolation

The overlay lives in a **closed Shadow DOM** attached to a single `<div>` appended to
`document.documentElement` (not `body` — some sites replace body). All styles are inside
the shadow root as one adopted `CSSStyleSheet`. The host div gets
`all: initial; position: fixed; inset: 0; z-index: 2147483647;` set via `style` attribute
with `!important` on each declaration, to survive hostile page CSS.

Page scroll is locked while reading (`overflow: hidden` on `documentElement`, restored on
close, preserving `scrollY`).

---

## 4. Text acquisition

Resolution order when the reader is invoked:

1. **Non-empty selection** → use `window.getSelection().toString()`. Highest priority;
   this is the common case and requires no extraction at all.
2. **Article extraction** → lazily `import()` the extraction chunk. Use
   `@mozilla/readability` against a `document.cloneNode(true)`. Take
   `article.textContent`, preserving paragraph breaks by first walking the parsed
   article's block elements and joining with `\n\n`.
3. **Readability returns null or < 200 chars** → fall back to a heuristic: collect all
   `<p>`, `<li>`, `<blockquote>`, `<h1>`–`<h6>` under the densest text-bearing subtree,
   excluding `nav`, `header`, `footer`, `aside`, and elements matching
   `[role=navigation|banner|complementary]`, `[aria-hidden=true]`, and any element with
   computed `display: none` or zero client rect.
4. **Still nothing** → show the paste panel: a textarea in the overlay, with the reader
   ready to run on whatever is pasted.

The extraction chunk must be a separate dynamic-import chunk so the ~30 KB is never paid
by the selection path.

**The exclusion list in step 3 applies to step 2 as well.** Strip `nav`, `header`,
`footer`, `aside`, `[role=navigation|banner|complementary]` and `[aria-hidden=true]` from
the cloned document *before* handing it to Readability, not just when running the
heuristic. Readability keeps a bare `<div role="banner">` cookie notice, which the
heuristic's block selector would never have matched — so filtering only in step 3 lets
banner text through on exactly the pages Readability succeeds on. Never strip from the
live document.

Strip from the result: sequences of ≥3 identical punctuation, footnote markers matching
`\[\d+\]`, image credits, and leading/trailing whitespace per paragraph.

---

## 5. Interaction

### 5.1 Entry points

| Entry point | Behaviour |
|---|---|
| Toolbar icon click | Inject and open the reader on the active tab |

The toolbar action deliberately has **no `default_popup`**. Chrome does not fire
`action.onClicked` when a popup is configured, so the two are mutually exclusive, and for
a speed reader the one-click instant start is worth more than a settings panel one click
closer. Settings live in the in-reader gear (§3.4) and in `options_ui`, which reuses the
same `popup.html`.

| Keyboard command `Alt+S` (`Cmd+Shift+S` on macOS) | Same |
| Context menu on a selection: "Read with Stillpoint" | Inject and open with that selection |
| Context menu on page: "Read this page with Stillpoint" | Inject and open with extracted article |

The service worker owns all four, and does nothing else. It must be able to be torn down
and revived by Chrome at any moment — hold no state in module scope beyond registration.

### 5.2 Keyboard (while the reader is open)

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Previous / next word (auto-pauses) |
| `Shift+←` / `Shift+→` | Previous / next sentence |
| `↑` / `↓` | WPM +25 / −25 |
| `PgUp` / `PgDn` | Previous / next paragraph |
| `Home` | Restart from beginning |
| `R` | Rewind to start of current sentence and resume |
| `Esc` | Close the reader |
| `1`–`4` | Font size S/M/L/XL |

Bind on the shadow root with `capture: true` and call `stopPropagation()` so page
handlers (Gmail's `j`/`k`, etc.) never fire. Restore focus to the previously active
element on close.

`R` — "rewind to the start of the sentence" — is the most-used recovery action in RSVP
reading and must feel instant. It also fires automatically when resuming from a pause of
more than 3 seconds, backing up 3 words so the reader re-enters with context.

### 5.3 Settings

Persisted in `chrome.storage.sync` under one key, `settings`, as a single object with a
`version` field for migration. Surfaced in the extension popup and in the in-reader gear.

```ts
interface Settings {
  version: 1;
  wpm: number;              // 150–1000, default 350
  fontSize: 20|28|36|48;    // default 36
  theme: 'auto'|'light'|'dark';
  maxWordLen: number;       // default 13
  factors: {                // §2.3 overrides
    sentence: number; clause: number; paragraph: number;
    longWord: number; numeric: number; paraStart: number;
  };
  autoRewindOnResume: boolean;  // default true
  hideControlsWhilePlaying: boolean; // default true
}
```

Defaults must be applied by merge, so a settings object written by an older version never
produces `undefined` at runtime.

---

## 6. Architecture

```
src/
  sw.ts                  service worker: commands, context menus, injection. No state.
  popup/                 popup UI: WPM, theme, font size, "Read this page"
  reader/
    index.ts             entry — mounts overlay, owns lifecycle
    engine/
      tokenize.ts        §2.1 — pure, no DOM
      orp.ts             §2.2 — pure
      timing.ts          §2.3 — pure
      scheduler.ts       absolute-deadline tick loop, visibility handling
    ui/
      redicle.ts         the frame + word rendering
      controls.ts        progress, transport, settings gear
      styles.css         adopted stylesheet
    extract/             lazy chunk
      index.ts           resolution order §4
      heuristic.ts       fallback extractor
  shared/
    settings.ts          load/save/merge/migrate
    types.ts
```

Everything under `engine/` is pure and framework-free, and is where the entire test suite
lives. No framework, no runtime dependencies except `@mozilla/readability` in the lazy
chunk. TypeScript strict. Bundled with `esbuild` (`--minify --format=esm --splitting`).

### 6.1 Manifest (MV3)

```json
{
  "manifest_version": 3,
  "name": "Stillpoint",
  "version": "1.0.0",
  "minimum_chrome_version": "116",
  "permissions": ["activeTab", "scripting", "storage", "contextMenus"],
  "background": { "service_worker": "sw.js", "type": "module" },
  "action": { "default_title": "Stillpoint" },
  "options_ui": { "page": "popup.html", "open_in_tab": false },
  "commands": {
    "open-reader": {
      "suggested_key": { "default": "Alt+S", "mac": "Command+Shift+S" },
      "description": "Open Stillpoint on this page"
    }
  },
  "web_accessible_resources": [
    { "resources": ["reader/*.js"], "matches": ["<all_urls>"] }
  ]
}
```

`minimum_chrome_version: 116` buys adopted stylesheets, `import()` in content scripts,
and stable `scripting.executeScript` with `world: "ISOLATED"`.

Known limitation to document in the README: `activeTab` injection is blocked on
`chrome://*`, the Chrome Web Store, and other extensions' pages. Detect the failure and
show a badge, don't fail silently.

---

## 7. Testing

- **Unit (vitest), on the pure engine.** Golden-file tests for tokenisation over a corpus
  of hard cases: URLs, `Dr. Smith`, `1,234.56`, `e.g.`, em dashes, ellipses,
  hyphenated compounds, 30-character German nouns, quotes spanning sentences. The ORP
  table gets an exhaustive test for lengths 1–30.
- **Timing.** Fake timers; assert cumulative drift over 10 000 simulated ticks is 0 and
  that a simulated 5 s background stall triggers auto-pause rather than a catch-up burst.
- **Visual.** Playwright with the extension loaded, screenshotting the Redicle at each
  font size in both themes, asserting the ORP glyph's bounding box centre is within 0.5 px
  of the 35% column across a set of words of length 1–20. This is the single most
  important test in the suite — it is what makes it Spritz and not a word flasher.
- **Extraction.** A fixture set of saved HTML (news article, blog, docs page, forum
  thread, SPA-rendered page) asserting extracted length and paragraph count within bounds.
- **Extension shell.** A load-unpacked run under Playwright's persistent context asserting
  the service worker registers without console errors, that injection mounts exactly one
  overlay, that a second injection toggles it closed rather than stacking, and that the
  options page renders. Note that the `activeTab` grant itself cannot be automated —
  Chrome only grants it on a genuine user gesture, and neither Playwright nor the
  extension can synthesize one. That single step is manual-verification-only, by design.
- **Perf.** A scripted run at 800 WPM for 60 s under the Chrome tracing API asserting no
  tick exceeds 2 ms and no forced reflow occurs.

## 8. Milestones

| # | Deliverable | Definition of done |
|---|---|---|
| M1 | Engine | `tokenize`/`orp`/`timing`/`scheduler` complete and unit-tested, no DOM |
| M2 | Redicle | Overlay renders, alignment test passes, keyboard works, hard-coded text |
| M3 | Extension shell | Manifest, SW, injection, context menus, popup, settings persistence |
| M4 | Extraction | Selection + Readability + heuristic fallback + paste panel |
| M5 | Polish | Themes, control fade, progress, auto-pause, error states, README |
| M6 | Ship | Perf + visual suites green, store listing assets, packed zip |

## 9. Open decisions

1. **CJK support in v1** (§2.5) — implement the 2-glyph chunker, or gate with a clear
   message and defer? Recommend: gate in v1, implement in v1.1.
2. **Readability vs. heuristic-only.** 30 KB lazy chunk buys markedly better extraction.
   Recommend: ship Readability.
3. **Bookmarklet build.** The same reader bundle can be shipped as a standalone
   bookmarklet for browsers where the extension can't be installed. Cheap, but out of
   scope for v1.

---

## Sources

- [How It Works — Spritz Reader](https://www.spritzreader.com/how-it-works)
- [Reading with Spritz: Twice as fast, half as good? — Cogsci.nl](https://www.cogsci.nl/blog/reading-with-spritz-twice-as-fast-half-as-good.html)
- [Spritz and other speed reading apps: prose and cons — The Conversation](https://theconversation.com/spritz-and-other-speed-reading-apps-prose-and-cons-24467)
- [Spritz Reinvents Reading on Mobile Devices, One Word at a Time — PR Newswire](https://www.prnewswire.com/news-releases/spritz-reinvents-reading-on-mobile-devices-one-word-at-a-time-246756751.html)
- [How "Spritz" technology flashes single words — iRevolution](http://irev.ru/en/technologii-all-en/95-2014/1047-how-spritz-technology-flashes-single-words-to-double-your-reading-speed)
- [tspreed — POSIX shell RSVP reader with Spritz-like ORP](https://github.com/n-ivkovic/tspreed)
- [speedread — terminal Spritz-alike (pasky)](https://github.com/pasky/speedread)
- [OpenSpritz — JS bookmarklet implementation](https://github.com/pirate/OpenSpritz)
- [Relocated virtual retinal image method and system — US 9,028,067 (Spritz)](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9028067)
