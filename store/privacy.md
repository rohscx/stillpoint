# Privacy practices

Stillpoint does not collect user data. It does not sell or transfer user data, and it does not use data for advertising, analytics, credit decisions, or any purpose unrelated to its single reading purpose. Selected text and extracted article text are processed locally in the active tab and are not retained by the extension.

Stillpoint makes no network requests and includes no telemetry, accounts, or remote code. All executable extension code is packaged with the submitted extension.

`chrome.storage.sync` stores only the user's reader settings (such as reading speed, font size, theme, and timing preferences). This storage and any browser-account synchronization of it are provided by Chromium; Stillpoint does not operate a server or transmit those settings itself. Page text, selections, reading position, reading history, and browsing history are not written to extension storage.

The manifest requests no `host_permissions`. Access to page content is temporary and occurs only when the user invokes Stillpoint under `activeTab`.
