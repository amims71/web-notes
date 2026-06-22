# Web Notes — Per-Domain Notes / Todos / Lists Browser Extension

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan

## Summary

A browser extension that stores notes, todos, and lists scoped per website domain,
kept entirely in local storage. While on a site you see its entries via the toolbar
popup and an optional on-page floating widget; a separate full-page app gives a
filterable tree view across all domains.

Concrete motivating uses: notes for Jira, todos for GitHub, a "to download" list and
a separate "seed to complete" list for torrent sites, messages to reply on Slack.

## Decisions (locked)

| Area | Decision |
| --- | --- |
| Entry model | **Named lists per domain.** Each domain has one or more named lists; each list holds items. |
| Item shape | text + done checkbox + optional link (`url`) + optional detail (`note`). |
| Scope | **Registrable domain** (e.g. `app.github.com` → `github.com`), with **optional per-page pin** for individual items. |
| Tech stack | **Vanilla HTML/CSS/JS, no build step.** Load unpacked. |
| On-page UI | **Toolbar badge count + optional floating widget** (content script, shadow DOM). |
| Browser target | **Chromium MV3** (Chrome / Edge). Firefox can be added later. |
| Storage | `chrome.storage.local` with `unlimitedStorage`. |
| State sync | All surfaces share storage and subscribe to `chrome.storage.onChanged`. |
| Backup | JSON export / import in the full-page app (local-only data). |

## Architecture

Three runtime surfaces over one shared core module.

```
  Popup            Floating widget        Full-page app
 (icon click)      (content script)       (app.html tab)
 current domain    on-page overlay        all domains
      \                  |                   /
       \                 |                  /
        \________________|_________________/
                         v
                 src/lib/storage.js   (single source of truth)
                         v
              chrome.storage.local (+ unlimitedStorage)
                         ^
                 background.js (service worker: badge only)
```

### State sync (chosen approach)

All three surfaces read and write the **same** `chrome.storage.local` and each
subscribes to `chrome.storage.onChanged`. Checking an item in one surface updates the
others live, with no message-passing glue. Rejected alternative: a background worker
that owns state and answers messages — unnecessary central authority for a personal
local tool, and it loses the free multi-surface sync that `onChanged` provides.

The service worker (`background.js`) has a single job: recompute the toolbar badge
when the active tab changes or storage changes.

### Storage layout

One key per domain (small granular writes, granular `onChanged`) plus a meta key:

```
meta              -> { schemaVersion: 1, settings: { ... } }
d:github.com      -> domain bucket (see model below)
d:jira.acme.com   -> domain bucket
```

The full-page app reads all buckets via `chrome.storage.local.get(null)` and filters
keys beginning with `d:`.

## Data model

A domain bucket:

```js
{
  domain: "github.com",
  widgetEnabled: true,          // per-domain: hide the floating widget on this domain
  lists: [
    {
      id,                        // e.g. crypto.randomUUID()
      name,
      collapsed: false,
      order,                     // integer sort position within the domain
      items: [
        {
          id,
          text,                  // the entry text
          done: false,           // checkbox state
          url: null,             // optional link; clicking opens it
          note: null,            // optional longer detail
          pageUrl: null,         // null = domain-level; set = pinned to one exact URL
          createdAt,             // epoch ms
          updatedAt,             // epoch ms
          order                  // integer sort position within the list
        }
      ]
    }
  ]
}
```

`meta.schemaVersion` enables future migrations. IDs use `crypto.randomUUID()`.

### Scope resolution

`src/lib/scope.js` maps a URL to its bucket key:

- Compute the **registrable domain** from the hostname using a small built-in
  multi-part public-suffix table (`co.uk`, `com.au`, `co.jp`, etc.). Pragmatic and
  good enough for a local tool; swappable for a full PSL later.
- IP addresses, `localhost`, and single-label intranet hosts bucket by the raw
  hostname.
- Non-web schemes (`chrome://`, `file://`, extension pages, empty new tab) resolve to
  "no scope": the widget never mounts and the popup shows an empty state.

Page-pinned items (`pageUrl` set) live in the same domain bucket but only surface on
that exact URL.

## UI surfaces

### 1. Popup (toolbar icon)

Scoped to the current tab's domain. Shows the domain's lists (header shows
done/total, collapsible), the items within each, and a "This page" section for items
pinned to the current exact URL. Supports inline add / check / edit / delete, a
new-list action, and a per-domain widget on/off switch. "Add item" can target
domain-level or pin-to-this-page. A "See all" control opens the full-page app.

### 2. Floating widget (content script)

Mounts only when the current domain has items **and** `widgetEnabled` is true for that
domain. Renders inside a **closed shadow DOM** so page CSS cannot bleed in or out.

- Collapsed: a draggable corner bubble showing the count of open (un-done) items;
  remembers its corner.
- Expanded: open items for the domain plus this page's pins, with inline check-off and
  quick-add, and a link to open the full app.
- Dismiss (✕) sets `widgetEnabled = false` for the domain; re-enable from the popup.

### 3. Full-page app (`app.html` in a tab)

The "see all" view.

- Left rail: **All**, or multi-select specific domains, as a filter.
- Main panel: a **tree** grouped Domain → List → Items. Page-pinned items show a ★ and
  their page URL.
- Search across all entries; "hide completed" toggle.
- Full add / edit / delete / rename for lists and items.
- **Drag-reorder** of items and lists (full-page app only).
- **Export / import** buttons.

## Backup: export / import

- **Export:** writes a single `web-notes-backup-<date>.json` containing the whole store
  (all `d:*` buckets + `meta`).
- **Import:** validates `schemaVersion` and shape first, then offers:
  - **Merge** — union by id; on id collision the newer `updatedAt` wins.
  - **Replace** — clear and load.

## Behavior defaults

- Drag-reorder is full-page-app only; popup and widget keep creation order.
- Completed items persist until deleted; a "hide completed" filter controls visibility
  rather than auto-clearing.
- Deleting a list with items asks for confirmation; deleting the last list in a domain
  removes the now-empty bucket.

## Error handling

- Storage write failure (e.g. quota) surfaces a small inline error; `unlimitedStorage`
  makes this rare.
- Import of malformed or wrong-version JSON is rejected before any write, with a clear
  message.
- Scope resolution never throws on odd URLs; it falls back to raw hostname or
  "no scope".

## File layout (no build step — load unpacked)

```
manifest.json
src/
  lib/
    storage.js      # read/write, onChanged subscribe, get-all
    scope.js        # registrable-domain resolution + multi-part-TLD table
    model.js        # id gen, item/list factories, validation, export/import merge
  background.js     # badge recompute on tab + storage changes
  popup/            popup.html  popup.js  popup.css
  app/              app.html    app.js    app.css
  content/          widget.js   widget.css
icons/              16/32/48/128
test/               unit tests for lib/
```

## Testing strategy

Pure logic in `src/lib/` (scope resolution, model factories, validation, import/merge)
is unit-tested in plain Node — no browser harness. UI surfaces stay thin wrappers over
tested `lib/` functions. Build with TDD: write each `lib/` module's tests before its
implementation.

## Out of scope (YAGNI for v1)

- Cross-device sync / `chrome.storage.sync`.
- Cloud accounts or a backend.
- Numeric progress tracking (e.g. seed ratio) — a todo item covers "seed to 1.0".
- Firefox packaging (architecture stays compatible for a later port).
- Rich text / attachments in notes.
