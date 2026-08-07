# Stillpoint

Stillpoint is an RSVP speed reader that reproduces the Spritz reading experience in a Chromium extension. It presents one word at a time, aligns each word on its Optimal Recognition Point (ORP), and holds that point inside a fixed Redicle so the eye can remain still.

## Install from source

```sh
npm install
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the generated `dist/` directory.

## Usage

Open Stillpoint by clicking its toolbar icon or pressing `Alt+S` (`Cmd+Shift+S` on macOS). You can also right-click selected text and choose **Read with Stillpoint**, or right-click a page and choose **Read this page with Stillpoint**.

While the reader is open:

Drag the Redicle frame to place the reading window anywhere in the viewport. Its position
is saved across reader sessions; use **Reset position** in settings to return to the default.

| Key | Action |
|---|---|
| `Space` | Play or pause |
| `←` / `→` | Previous or next word; pauses playback |
| `Shift+←` / `Shift+→` | Previous or next sentence |
| `↑` / `↓` | Increase or decrease speed by 25 WPM |
| `PgUp` / `PgDn` | Previous or next paragraph |
| `Home` | Restart from the beginning |
| `R` | Rewind to the current sentence and resume |
| `Esc` | Close the reader; closes settings first when settings are open |
| `1`–`4` | Font size S, M, L, or XL |
| `Alt+←` / `Alt+→` / `Alt+↑` / `Alt+↓` | Move the Redicle by 2% of the viewport |
| `Alt+0` | Reset the Redicle position |

If a page has no extractable article text, Stillpoint offers a paste field instead.

## Known limitations

Chromium does not allow the reader to be injected into `chrome://*` pages, the Chrome Web Store, or other extensions' pages. Injection into `file://` URLs also requires opting in to file access on the extension's details page. Stillpoint displays a `!` badge when injection is blocked instead of failing silently.

CJK and right-to-left scripts are gated in v1 because whitespace tokenization and the Latin Redicle layout would produce incorrect output. Stillpoint explains the limitation and leaves the paste field available; support is planned.

## Privacy

Stillpoint makes no network requests at runtime and uses no telemetry or accounts. Its manifest declares no `host_permissions`. Page access is granted only when you invoke the extension, through Chromium's `activeTab` permission; the extension has no ambient permission to read your browsing.

Settings are stored with `chrome.storage.sync`, which is provided by the browser. The extension itself does not send page text or reading activity to any service.

## Licence

Licensed under the [Apache License, Version 2.0](LICENSE). Copyright 2026 rohscx.

Stillpoint bundles [@mozilla/readability](https://github.com/mozilla/readability), also Apache-2.0; see [NOTICE](NOTICE) for attribution. Both files ship inside `dist/`, so an unpacked or packed build carries its own licence terms.

Stillpoint is an independent reimplementation of a reading technique popularised by Spritz Inc. It is not affiliated with, endorsed by, or derived from any Spritz Inc. source code.

## Development

- `npm run typecheck` checks strict TypeScript types.
- `npm test` runs the Vitest unit suite for tokenization, ORP selection, timing, scheduling, extraction cleanup, heuristics, and settings migration/storage.
- `npm run test:e2e` runs Playwright coverage for Redicle alignment, keyboard behavior, extraction and fallbacks, settings, pause/error states, and performance.
- `npm run build` creates the unpacked extension in `dist/` and reports raw and gzipped JavaScript bundle sizes.
- `npm run audit:budget` verifies the shipped size, dependency, manifest, and permission budgets.
- `npm run screenshots` builds and regenerates the 1280×800 store images in `store/screenshots/`.
- `npm run package` builds and verifies the deterministic Chrome Web Store zip at the repository root.
