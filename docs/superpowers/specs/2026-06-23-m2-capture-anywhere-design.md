# Milestone 2 — Capture From Anywhere (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Part of:** the multi-milestone roadmap (M1 shipped). Builds on
`docs/superpowers/specs/2026-06-22-web-notes-extension-design.md` and the M1 spec.

## Summary

Add right-click **context-menu capture** (selected text, the current page, a
linked URL) and two **keyboard shortcuts** (open the popup, save the current
page). Captured items land in a dedicated per-domain **"Inbox"** list, as
**domain-level** items (no page pin). The capture logic is a pure, unit-tested
helper in `model.js`; the background service worker wires Chrome events to it.
Popup, full-page app, and the floating widget are untouched.

## Decisions (locked from brainstorming)

| Topic | Decision |
| --- | --- |
| Context-menu captures | **All three**: selected text, this page, linked URL. |
| Target list | A dedicated per-domain **"Inbox"** list (auto-created). |
| Pinning | **Domain-level** — captured items have `pageUrl = null`. |
| Shortcuts | **Open popup** (`_execute_action`) and **save this page** (`save-page`). |
| Feedback | Toolbar **badge increment** only (no new permission); richer notifications are deferred to M3. |
| New permission | **`contextMenus`** (and a `commands` manifest key — no permission prompt). |

## Captured item shapes (all domain-level: `pageUrl = null`)

| Source | `text` | `url` |
| --- | --- | --- |
| Selection | the selected text (trimmed) | the source page URL (so it gets a 🔗 back to source) |
| This page | the page title (`tab.title`) | the page URL |
| Linked URL | the link's URL (`info.linkUrl`) | the link's URL |

All captures go to the **current page's domain bucket** (resolved from
`info.pageUrl` / the active tab URL), not the link's domain. `url` is always an
`http(s)` URL, so the existing `isHttpUrl` guard renders the 🔗.

## Non-goals (this milestone)

- No notification/toast feedback (badge increment only — notifications arrive in
  M3 with that permission).
- No capturing the link's *display text* (Chrome's context-menu data lacks it
  without a content-script round-trip; the link URL is used as the text and is
  renameable). A content-script enhancement can add this later.
- No changes to popup, full-page app, or the floating widget.
- No submenu/list-picker — captures always go to "Inbox".

## Architecture

```
Right-click menu  ┐
                  ├─► background.js (service worker) ──► addToInbox(bucket,…) ──► setDomain
Keyboard command  ┘        (model.js, pure, tested)
```

No content script involvement; capture is entirely background + the tested
helper. The badge already recomputes on storage change, so a capture visibly
bumps the count.

## Tested pure helper (`src/lib/model.js`)

- `INBOX_NAME = "Inbox"` (exported constant).
- `addToInbox(bucket, fields, opts = {})` →
  Returns a **new** bucket (non-mutating, like `moveItem`/`reorderLists`). Finds
  the list named `INBOX_NAME`; if absent, creates one (with `order =
  nextOrder(bucket.lists)`). Appends `makeItem({ ...fields, order:
  nextOrder(inbox.items) }, opts)`. `opts` forwards `{ id, now }` for
  deterministic tests. `fields` carries `{ text, url }` (and any item fields);
  `pageUrl` defaults to `null` via `makeItem`.

## Manifest changes (`manifest.json`)

- `permissions`: add `"contextMenus"` (now `["storage","unlimitedStorage","tabs","contextMenus"]`).
- Add a top-level `"commands"` key:
  - `_execute_action` with `suggested_key.default = "Alt+Shift+N"` — Chrome opens
    the popup; no handler code needed.
  - `save-page` with `suggested_key.default = "Alt+Shift+S"` and a description.

## Background behavior (`src/background.js`)

- **`runtime.onInstalled`**: create three context-menu items, each with
  `documentUrlPatterns: ["http://*/*", "https://*/*"]` so they appear only on web
  pages:
  - id `capture-selection`, `contexts: ["selection"]`, title "Add selection to Web Notes".
  - id `capture-page`, `contexts: ["page"]`, title "Add this page to Web Notes".
  - id `capture-link`, `contexts: ["link"]`, title "Add link to Web Notes".
  Continue to set the badge background color here (existing behavior).
- **`contextMenus.onClicked(info, tab)`**: resolve scope from `info.pageUrl`; if
  non-web, return. Build `fields` per `info.menuItemId` (table above), then
  `const bucket = (await getDomain(scope.key)) ?? makeDomainBucket(scope.domain);`
  and `await setDomain(scope.key, addToInbox(bucket, fields))`.
- **`commands.onCommand(command)`**: for `save-page`, query the active tab,
  resolve scope from its URL; if non-web, return; capture the page (text =
  `tab.title`, url = tab URL) the same way.
- The badge listeners from M0/M1 already refresh on the resulting storage change.

## Error handling / edge cases

- Non-web pages: context-menu items are not shown (`documentUrlPatterns`), and the
  `save-page` command no-ops after scope resolution.
- Empty/whitespace selection: trimmed; if empty, skip (no item created).
- Missing `tab.title` (rare): fall back to the page URL as the text.
- A domain with no bucket yet: `makeDomainBucket` is created on the fly before
  `addToInbox`.
- Duplicate context menus on service-worker restart are avoided by creating them
  only in `onInstalled` (Chrome persists them).

## Testing strategy

- **Unit (Node):** `addToInbox` — creates the Inbox list when absent and appends;
  appends to an existing Inbox; assigns `order` via `nextOrder`; forwards
  `{id, now}`; is **non-mutating** (snapshot compare). The capture-field mapping
  is trivial and exercised manually.
- **Manual (browser, deferred to end):** right-click selection/page/link →
  item appears in that domain's Inbox with the right text/link and the badge
  bumps; `Alt+Shift+S` saves the current page; `Alt+Shift+N` opens the popup;
  menus absent on `chrome://` pages.

## Files touched

```
manifest.json          # + contextMenus permission, + commands (2)
src/lib/model.js       # + INBOX_NAME, addToInbox (pure, tested)
src/background.js      # context menus (onInstalled) + onClicked + onCommand
test/model-inbox.test.js  # unit tests for addToInbox
```
(Popup, app, widget untouched.)

## Roadmap context (later milestones)

M3 due dates + reminders (adds `notifications`/`alarms`, plus capture
confirmation toasts) · M4 tags + sort/archive · M5 sync + scheduled backup +
Markdown export · M6 polish.
