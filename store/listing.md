# Chrome Web Store listing

## Extension name

Stillpoint

## Short description

Read any article one word at a time with a focused RSVP reader, precise ORP alignment, and no tracking.

Character count: **103** (including spaces and punctuation; maximum 132).

## Detailed description

Stillpoint is a focused RSVP speed reader for Chromium. It presents one word at a time in a fixed Redicle and highlights each word's Optimal Recognition Point (ORP), helping your eyes stay anchored while you read.

Start from selected text, the main article on the current page, or text you paste. Adjust the reading speed from 150 to 1,000 words per minute, choose a comfortable font size and light or dark theme, then navigate by word, sentence, or paragraph with the keyboard.

Stillpoint runs only when you invoke it. It has no accounts or telemetry, requests no host permissions, and makes no network requests. Text extraction and reading happen locally in the current tab. Your reader settings can be saved through the browser-provided sync storage.

Stillpoint is an independent implementation of the RSVP/ORP reading technique and is not affiliated with Spritz Inc.

## Category

Productivity

## Single purpose

Stillpoint's single purpose is to let a user read text they deliberately choose from the active page—or paste themselves—one word at a time in an RSVP reader with a fixed ORP alignment point.

## Permission justifications

### `activeTab`

Provides temporary access to the current tab only after the user invokes Stillpoint, so the extension can obtain the selected text or article text and display the reader. Stillpoint does not have ambient access to browsing activity.

### `scripting`

Injects the reader and its local text-extraction code into the active tab after a user action. There is no declarative content script, and no code is fetched remotely.

### `storage`

Stores reader preferences such as words per minute, font size, theme, and timing settings in `chrome.storage.sync`. It does not store page text, selections, reading history, or browsing history.

### `contextMenus`

Adds “Read with Stillpoint” for selected text and “Read this page with Stillpoint” to the page context menu, giving users explicit ways to start the reader.

The manifest requests no `host_permissions`. Stillpoint makes no network requests; page text is processed locally in the tab and is not transmitted by the extension.
