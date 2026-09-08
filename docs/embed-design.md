# Embedding Stillpoint: supplied content, shared reader

Design exploration, 8 September 2026. This is a proposal, not a change to the extension contract. `SPEC.md` §§1.2, 1.3, 3.5, 4 and 5.3 remain authoritative for the extension. No production source or tests have been edited.

## Decision: A, with acquisition owned by the RSS reader

Ship a local reader accepting plain text or structured blocks. The RSS button needs the **article body**, not the article URL. A covers the motivating case when the reader has full feed content (for example `content:encoded`) or has already acquired the article on its server. Convert feed HTML to text/blocks in the reader's existing ingestion pipeline. An excerpt-only feed can supply its excerpt, clearly labelled; A cannot conjure the missing article.

| Option | What it actually delivers | Recommendation |
|---|---|---|
| A: supplied text/blocks | No acquisition, service, credentials or reading-data transmission in Stillpoint | Default and first release |
| B: embedder's proxy/fetch function | Host obtains content and passes the result to A; host pays and owns privacy, permissions and reliability | Document as an integration recipe, outside core |
| C: Stillpoint proxy | Central service sees article requests and potentially user identity; requires operations, retention policy, abuse prevention and publisher access handling | Do not build |

A script executing on site A has A's origin privileges, regardless of where its script file was downloaded. Cross-origin `fetch(B)` needs B's CORS permission to expose the response. `mode: 'no-cors'` gives an opaque response, not usable article text. An iframe does not grant access to B's DOM. These browser constraints are specified in the [Fetch Standard](https://fetch.spec.whatwg.org/#http-cors-protocol) and [HTML origin rules](https://html.spec.whatwg.org/multipage/browsers.html#origin). A cooperating publisher can permit access; that is not a general acquisition strategy.

B can fetch server-side, but server HTML is not necessarily the rendered, authenticated DOM the extension receives. Paywalls, client rendering and anti-bot measures remain. A proxy needs URL/scheme restrictions, private-address and redirect checks against SSRF, response-size/time limits, authentication and rate limits. Do not ship a generic public relay. A custom fetch function in the browser alone does not bypass CORS. If a host uses B, its page has network activity and must describe it honestly; Stillpoint can still make none. C would invalidate the no-network/no-collection claim **for that service and embed**, not magically change the unchanged extension's behavior. Keep product claims scoped.

## Verified coupling and proposed extraction of the library

The main premise holds: `src/reader/engine/` has no `chrome`, `document` or `window` references. Its scheduler uses `globalThis.performance` and timers through an injectable clock; it is DOM-free, not devoid of runtime dependencies.

Two corrections to the seam inventory:

- `src/reader/index.ts` really does use `runtime.chrome?.runtime?.onMessage` in `runInjectedEntry()`, registering and disposing a settings/close listener. Its `InjectionRuntime` type also names Chrome. The `.sp-reader-chrome` variable is indeed unrelated. This is a **fourth extension seam**, alongside injected global selection/state and the `__STILLPOINT_INJECTED__` build flag.
- `extract/index.ts` already falls back, but to `new URL('/dist/' + filename, documentRoot.location.href)`. That is **origin-root-relative**, not relative to the module or a developer's asset directory. It explains the Playwright fixtures, but will fail for many installations under subpaths or CDNs.

Settings already accept a `SettingsStorageArea` argument in `loadSettings`/`saveSettings`. The Chrome coupling is in their default argument and availability probe, plus the reader's persistence decisions. Version already catches failures and returns `undefined` outside Chrome; `ui/settings.ts` still calls it directly. `mountReader(text, overrides)` already offers a plain-text mount, but its entry module imports acquisition and extension lifecycle, and its full UI makes persistence decisions. Merely republishing that entry is not the desired boundary.

Proposed layout (future work, **no moves in this exploration**):

| Existing files | Proposed destination / responsibility |
|---|---|
| `src/reader/engine/{index,tokenize,orp,timing,scheduler,comfort}.ts` | `packages/core/src/engine/`, unchanged algorithms |
| `src/shared/types.ts` | `packages/core/src/types.ts`; export `Block`, settings and overrides |
| `src/shared/settings.ts` | Pure validation/migration to `core/src/settings.ts`; Chrome lookup/defaults to extension storage adapter |
| `src/reader/ui/{redicle,overlay,controls,keyboard,drag,comfort,settings,error,paste}.ts`, `styles.css`, `styles.d.ts` | `core/src/ui/`; separate paste entry, version injection into settings UI; harden lifecycle/overlay before stable release |
| `src/reader/index.ts` | Split mount/render/settings lifecycle into `core/src/reader.ts`; retain injection, message subscription and toggle semantics in extension adapter entry |
| `src/shared/version.ts` | Extension adapter supplies manifest version; core only accepts optional display version |
| `src/reader/extract/{index,readability,heuristic,blocks,clean,noise}.ts` | Optional `@stillpoint/core/extract` entry, never imported by plain-text entry; replace URL lookup with supplied asset resolver/base |
| `src/sw.ts`, `src/shared/messages.ts`, `src/popup/*` | Stay extension-owned; popup consumes shared migration/types |

Proposed public API, not all implemented by the POC:

```ts
type Content = { text: string; blocks?: never } |
               { blocks: readonly Block[]; text?: never };
interface StorageAdapter {
  load(): Promise<unknown>;                 // settings only
  save(settings: Settings): Promise<void>;
}
interface ReaderOptions {
  storage?: StorageAdapter;                // default: per-instance memory
  settings?: SettingsOverrides;
  version?: string;                        // host-supplied display version
  onOpen?: () => void;                     // host shortcut suspension
  onClose?: () => void;
  onError?: (error: Error) => void;         // no content in errors
}
interface Reader {
  open(content: Content & { title?: string; autoplay?: boolean }): Promise<void>;
  close(): void;
  destroy(): void;
}
export function createReader(options?: ReaderOptions): Reader;

// Optional acquisition entry; never implied by reader.open().
export function createExtractor(options: {
  assetBaseUrl: URL;                       // trailing slash, host-owned
  resolveAsset?: (name: 'extract.js' | 'heuristic.js') => string;
}): { fromDocument(document: Document): Promise<Block[]> };
```

`open` validates/copies bounded content, replaces playback from token zero, and defaults to autoplay following a button click. No document selection or page scraping occurs implicitly. Empty, malformed and unsupported-script input rejects without closing the current session. Latest open wins during async settings loads; close/destroy invalidates pending work. One active overlay per document, with an explicit coordinator rather than accidental global collisions. `close` is idempotent and reusable; `destroy` also drops settings/content references and makes later opens reject. Content stays in memory only while needed. Release timers, observers, media-query listeners, drag handlers and focus/scroll leases on all exits, including mounting failures. Bounded settings failures fall back to defaults and report a content-free error without preventing reading; serialize writes so an older save cannot win.

The extension adapter provides sync storage, manifest version and `chrome.runtime.getURL`, handles activeTab acquisition and runtime messages, and keeps today's second-invocation toggle. Core imports no Chrome API and has no extension globals or import-time DOM work. Storage is opt-in for embeds: no ambient localStorage writes, no reading history, no cross-site settings sync. A host may provide namespaced localStorage or another adapter, with its own disclosure and failure handling.

## Distribution and smallest call site

Publish tree-shakable npm ESM, declarations and explicit package exports: root reader, `/engine`, optional `/extract`, and later `/element`. Supply a separate bundled IIFE exposing `Stillpoint.createReader`; it must not reuse the extension IIFE, which auto-runs injection. Both plain-text builds include CSS as a string and no dynamic chunks or Readability. Mark registration side effects only on the optional element entry. Self-host and pin assets; no CDN is required.

```js
import { createReader } from '@stillpoint/core';
const reader = createReader();
button.onclick = () => reader.open({ title: article.title, text: article.text });
```

For script users:

```html
<script src="/vendor/stillpoint.iife.js" defer></script>
<script src="/rss-reader.js" defer></script>
```

`rss-reader.js` uses `const reader = Stillpoint.createReader()` and the same handler. Asset downloads are network requests if served over HTTP, even from the same origin. Define the embed promise as **no content fetching or outbound runtime communication after asset delivery**; bundle inline for literal zero additional requests, as the POC does. Do not claim an externally loaded script needs no download.

A custom element is optional convenience, not the primary button surface. A single `<stillpoint-reader>` with `element.open({text})` can delegate to the same controller and destroy on disconnection; avoid one reader per article. Do not put article bodies in attributes or slotted HTML. Registration introduces global-name/version collisions and upgrade timing, and a reader nested inside host layout still needs a document-level overlay portal. An ordinary button plus `createReader` is smaller and works with any framework. Do not spend the first weekend implementing the element.

## Isolation: preserve geometry, cooperate with the host

Retain the closed shadow root, internal adopted stylesheet, and §3.5's `all: initial` and fixed positioning with important declarations on the document-root host. This is CSS encapsulation, not a security sandbox. Do not expose the shadow root as public API.

- **Style hardening:** `all` does not reset custom properties, `direction` or `unicode-bidi`. Explicitly establish direction, writing mode, bidi behavior, box sizing, color scheme and internal variables; expose only deliberate customization knobs. Audit important host selectors and pseudo-elements. Keep fonts local. Test zoom, narrow viewports, root transforms, forced colors and reduced motion. The existing 320px minimum and full controls need mobile testing; the POC only adds a narrow-screen width override.
- **Scroll:** current `Overlay` stores inline overflow and scrollY, losing overflow priority and horizontal position. A production document-level lock must preserve values **and priorities**, both scroll coordinates, existing locks and host changes. Acquire/release with ownership and reference counting; do not overwrite a host modal's newer state. Address scrollbar layout shifts and mobile body scrolling. Provide host lock hooks where a design system already owns modals. One reader instance alone is not enough to solve other owners' locks.
- **Focus:** current trap wraps Tab among controls, but is not background inertness and does not stop programmatic focus escape. Use coordinated `inert` on background subtrees with exact restoration, focus containment while active, a labelled dialog and a reliable close button. Restore the invoking button with `preventScroll` only if still connected and focusable; otherwise use an agreed host fallback. Handle dynamic/disabled controls and settings panels. Keep a readable static text alternative; never announce every word as a live region.
- **Stacking:** `2147483647` beats ordinary stacking contexts, not the browser top layer. A host modal dialog/popover or fullscreen element can still obscure the overlay. Support a host modal integration contract first; evaluate a modal `<dialog>` top-layer wrapper with the same shadow isolation for the stable library. Test competing modals, Escape and focus restoration. Arbitrary higher z-index values cannot solve this.
- **Keys:** attach only while open, handle keys within the reader, respect text-entry fields, composition and browser modifier shortcuts, and prevent default/stop propagation only where appropriate. Host `onOpen`/`onClose` hooks suspend its shortcut manager. A document/window **capture** listener runs before the shadow listener; shadow `stopPropagation()` cannot undo it. §5.2's claim that page handlers never fire is too strong. This follows the [DOM event dispatch order](https://dom.spec.whatwg.org/#concept-event-dispatch). Do not race the host with global capture listeners or hijack unrelated shortcuts. The POC supports Space/Escape and the existing Tab trap only.

A hostile host can remove, alter or impersonate the reader. Guaranteeing isolation from the site itself is infeasible for a same-realm embed. These hardening changes are a project, not incidental packaging work.

## Security and privacy: a different invoker

The extension is user-invoked with temporary activeTab authority. An embed is invoked by the site, with site-supplied content, in the site's JavaScript realm. Ask integrators to open only after a deliberate user gesture and identify the article; do not present the overlay as an extension-trusted surface. This is a cooperative UX contract, not a barrier against malicious site code.

Prefer plain text and validated `Block[]`. Render strings with `textContent`; never interpret titles, language labels or lines as markup. Copy and validate discriminants and string types, bound total characters/tokens, block/line counts and line lengths before expensive synchronous work. The existing 65,536-glyph token guard is useful but insufficient as a total-input limit. Start with a documented 200,000-character prototype cap; profile real long articles before choosing release bounds.

Do **not** offer raw HTML in the first core API. Readability is an extractor, not a sanitizer. A future HTML adapter needs an audited parser/sanitizer pipeline that removes scripts, event handlers, URL-bearing elements/attributes, SVG/MathML, styles, embeds and active content **without loading resources**, then converts an allowlisted paragraph/list/pre/code structure into blocks. Never insert received HTML into the live document; an inert parse alone is not the full safety argument. Preserve code whitespace. HTML support adds security maintenance, CSP/Trusted Types compatibility and a hostile-input test corpus; existing feed ingestion is a better home for it initially.

The §4 paste finding is even more direct here: the host already owns supplied article text, and page capture listeners can observe clipboard events. Closed shadow DOM cannot protect pasted secrets; a site can instrument `attachShadow` before initialization, as the existing fixture does. Omit paste by default in the embed. If explicitly enabled later, retain the warning and make clear it is the site's input surface. Sensitive paste requires a separately trusted origin/application, not another event suppression trick.

Never add telemetry, beacons, tracking pixels, analytics/error uploads, remote fonts, update checks, prefetch, article fetch, clipboard reads without interaction, service workers or reading-history persistence. Do not emit article text or per-word events into public DOM events; minimal lifecycle callbacks suffice. A host can itself collect data, so promise what **Stillpoint** does, not that a host page collects nothing. Runtime CSP must accommodate host-owned script/style assets without `eval`; production docs should support hashes/nonces, not tell sites to weaken policy. The self-contained POC uses inline-script/style allowances plus `default-src 'none'` and explicit network/resource prohibitions for a local demonstration.

## Size and cost

Targets are decimal gzip bytes, including reader JS and inline CSS, excluding host application and license documentation. Measure ESM and IIFE separately in CI.

| Deliverable | Proposed target | Cost / evidence |
|---|---:|---|
| Plain text/blocks + basic reader | ≤10,000 B gzip | POC is 8,528 B; actual engine, Redicle, overlay and full existing CSS, minimal controls |
| Full settings/comfort/drag UI | ≤18,000 B gzip provisional | Requires measurement after splitting; much of today's size is UI |
| Optional extraction | ≤15,000 B gzip provisional | Current Readability chunk 12,502 B plus heuristic 1,220 B; sanitizer would be additional |

Current rebuilt extension injection is **17,391 B gzip**, matching the cited 17.4 KB; Readability is already separate. Therefore removing Readability does not subtract its bytes from 17.4 KB. The small embed saves by excluding acquisition glue, extension lifecycle, paste and optional UI; plaintext never needs Readability at all. POC complete HTML is 40,353 B raw / 14,720 B gzip, including two articles, host page and full license.

Keep §1.3's ≤2ms steady-state tick and scheduling behavior; do not claim this POC rebenchmarks them. Tokenization is synchronous upfront and allocations scale with text. Code-block entry has the existing one-time exception. A loaded npm module or IIFE necessarily retains code and an idle controller: literal zero listeners **and zero memory** while closed is impossible for an installed embed. Require zero timers/observers/global handlers while closed, release article data, and acknowledge module/controller memory plus host button listeners. Lazy loading shifts first-click latency and asset delivery; it does not make them free.

## Licensing

Apache-2.0 is workable for commercial and proprietary sites embedding this library; it does not require opening their application source. Redistributors must supply a license copy, mark modified files, retain applicable source notices, and carry applicable NOTICE attribution in a distributed NOTICE file, accompanying source/documentation, or the usual third-party-notices display. A permanent visible badge is not required. The npm/IIFE releases should ship LICENSE and variant-correct NOTICE; embedders must carry them through bundling. Preserve Stillpoint attribution and the relevant independence statement. Readability-bearing distributions retain Mozilla/Arc90 notices; a text-only build can omit notices relating solely to excluded Readability. Existing NOTICE's `dist/extract.js` statement needs updating for the extraction package, not blindly copying into every build. The POC embeds the full license and relevant attribution. Apache's contributor patent grant does not license unrelated third-party patents or imply Spritz endorsement. See [Apache-2.0 §§3–4, 6](https://www.apache.org/licenses/LICENSE-2.0.txt).

## Milestones and SPEC changes

1. **Weekend: private supplied-text preview.** This POC plus a reproducible bundle; one controller, two article buttons, replacement/close, real engine/Redicle, no persistence/acquisition. Validate playback, pause, switching, focus restoration and zero requests in a normal Chromium environment. Ship as an experimental demo, not a stable package or accessibility claim. No production refactor required.
2. **Small follow-up: experimental ESM/IIFE package.** Split the four extension seams, retain test behavior, add validated blocks and injected storage/version/assets, deterministic lifecycle and latest-open-wins. Add package import/size/CSP tests and an extension parity gate. This is the first reusable library; estimate several focused days after the preview, not an automatic weekend promise.
3. **Project: stable embed.** Modal coordination, focus/inert restoration, top-layer conflicts, mobile/zoom/AT testing, strict CSP, multiple versions/instances, payload limits and async error races. Establish supported browsers (initially Chromium 116+ like the existing build) before promising Safari/Firefox. Add optional element only on demonstrated demand.
4. **Separate optional work:** host-side acquisition recipe; only later a reviewed HTML-to-blocks adapter. No hosted proxy milestone.

Before release, amend §1.2 to define extension and embed delivery profiles and embed non-goals; §1.3 to scope asset delivery, idle memory, embed size and runtime network guarantees; §3.5 to specify coordinated locks, focus/inert ownership, top-layer policy and CSS isolation limits; §4 to separate explicit supplied content from extension selection/extraction/paste resolution and document validation/HTML policy; §5.3 to define storage injection and memory defaults while preserving extension sync/migration. Also update §§5.1–5.2 for site invocation and cooperative shortcuts, §6 package/adapter boundaries, §7 embed acceptance tests and §8a host-supplied version. Keep normative engine timing and ORP geometry unchanged. **Do not silently relax extension promises to accommodate the embed.**

## POC provenance and verification

Open `docs/embed-poc.html` directly from disk; it contains everything and needs no server. `node docs/build-embed-poc.mjs` regenerates it from `docs/embed-poc.ts` and unchanged source modules. The bottom inline script is the integration example; it calls `createReader().open({title,text})`. Closing then selecting the other card changes content; repeated API opens also replace the current reader. The adapter intentionally omits full settings, extraction, paste, drag and comfort controls. It inherits the current overlay's limitations above and is not the hardened design.

Verified here: deterministic bundling with no extraction/extension entry dependencies; extension build, budget audit and typecheck pass; the POC also passes a separate strict TypeScript check; **120/120 unit tests pass**. Existing **44 Playwright specs remain untouched**, but `npm run test:e2e` could not start its HTTP server: sandbox `PermissionError: [Errno 1] Operation not permitted` on socket bind. A separate file-URL smoke launch was also denied by macOS sandbox Mach-port permissions. No connected browser was available for visual inspection. Consequently browser playback, visual QA and 44/44 status are **not claimed verified** in this environment. Run the original suite in an environment permitting its server/browser before merging. The supplied demo requires that final browser check too.
