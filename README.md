# Web Notes

A Chromium (Manifest V3) browser extension for keeping notes, todos, and lists
**scoped per website domain** — all stored locally, no account, no backend.

Keep Jira notes on Jira, GitHub todos on GitHub, a "to download" and a "to seed"
list on a torrent site, replies to send on Slack — each surfaces only where it
belongs.

## Features

- **Per-domain lists** — one or more named lists per domain, each with checkable
  items, optional links, and optional per-page pins.
- **Toolbar popup** — the current domain's lists at a click, with inline
  add/check/edit/delete.
- **On-page floating widget** — a draggable bubble (closed shadow DOM, no page
  CSS bleed) showing open items for the page; quick-add and check off in place.
- **Toolbar badge** — open-item count for the active tab's domain.
- **Full-page app** — a tree across all domains with rail filtering, search,
  hide-completed, drag-reorder, and JSON **export / import** (merge or replace).
- **Local-only** — everything lives in `chrome.storage.local`; all surfaces stay
  in sync via `chrome.storage.onChanged`.

## Install (load unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.

No build step — it loads as-is.

## Development

```bash
npm test        # run the unit suite (Node's built-in test runner, no deps)
npm run icons   # regenerate the toolbar icons
```

Pure logic lives in [`src/lib/`](src/lib/) (scope resolution, data model, storage
access) and is unit-tested in plain Node. The UI surfaces — popup, content-script
widget, full-page app — and the background service worker are thin layers over it.

Design and implementation notes are under
[`docs/superpowers/`](docs/superpowers/).

## License

[MIT](LICENSE) © 2026 Amimul Ehshan
