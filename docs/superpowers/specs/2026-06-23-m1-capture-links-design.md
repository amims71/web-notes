# Milestone 1 — Capture & Links (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Part of:** the multi-milestone feature roadmap (see end of doc)
**Builds on:** `docs/superpowers/specs/2026-06-22-web-notes-extension-design.md`

## Summary

Expose and improve per-item capture in the existing extension: edit an item's
**link** and **notes** via an inline expandable details panel, a popup
**"save this page"** quick action, and **cross-list move + list reordering** in
the full-page app. No data-model change and no new permissions — `item.url` and
`item.note` already exist (stored, validated, exported); they simply have no
editing UI yet.

## Decisions (locked from brainstorming)

| Topic | Decision |
| --- | --- |
| Saved link granularity | **One link per item** (not per list). Reuses `item.url`. |
| Link + notes editing | **One inline expandable details panel** per item holding both a Link field and a Notes textarea. |
| "Use this page" | Available only where a page context exists: **popup** (active tab URL) and **widget** quick-add path is unchanged this milestone; the **full app** is manual-URL entry only. |
| "Save this page" | **Popup button** that adds a new item with `url` = current canonical page, **blank text** (focused for typing). |
| Reordering | **Cross-list move + whole-list reorder**, **full-page app only**. Popup/widget unchanged. |
| Data model | **No change.** Reuse `url`, `note`. Bump `updatedAt` on every edit. |
| Permissions | **No new permissions.** |

## Non-goals (this milestone)

- No list-level link (the link is per item).
- No "save this page" / details editor in the floating widget (kept lightweight;
  revisit in a later milestone).
- No cross-**domain** item moves (an item stays in its domain bucket).
- Persisting details-panel open/closed state across re-renders (ephemeral UI
  state, consistent with current list-collapse behavior).

## Item row & details panel

### Collapsed row (popup and full app)

Gains two indicators and a disclosure toggle, alongside the existing controls:

```
☐ reply to issue 91        🔗 📝 ▸ ✕
```
- **🔗** rendered only when a valid `http(s)` `url` is set → click opens it in a
  new tab (the "go visit" affordance). Reuses the existing `isHttpUrl` guard.
- **📝** rendered only when `note` is a non-empty string.
- **▸ / ▾** toggles the details panel.
- Existing: checkbox, text (double-click to edit), delete ✕, page-pin ★ (app),
  drag handle (app).

### Expanded details panel (inline, under the item)

```
☐ reply to issue 91        🔗 📝 ▾ ✕
  ┌───────────────────────────────────────────────┐
  │ Link  [https://…                ] [Use this page] ✕ │
  │ Notes ┌───────────────────────────────────────┐ │
  │       │ waiting on QA reply…                   │ │
  │       └───────────────────────────────────────┘ │
  └───────────────────────────────────────────────┘
```

- **Link field:** a text input bound to `item.url`. Typing/pasting updates it on
  change/blur. A ✕ button clears it (sets `url` to `null`).
- **"Use this page"** button: fills the field with the current page's canonical
  URL. Shown only in the **popup** (active tab's URL via
  `chrome.tabs.query`). Hidden in the **full app** (no page context).
- **Notes field:** a `<textarea>` bound to `item.note`; updates on change/blur.
  Empty input stores `null` (so the 📝 indicator clears).
- Every edit sets `item.updatedAt = Date.now()` and persists via `setDomain`,
  so cross-surface sync and import-merge keep working unchanged.
- Stored `url`/`note` continue to round-trip through export/import; the
  `validateBucket` type checks added previously already cover them.

## "Save this page" (popup only)

A footer button **`+ save this page`** in the popup:

1. Resolve the active tab's scope (it is already known to the popup). If the page
   is non-web, the button is hidden/disabled.
2. Ensure a target list exists: use the first list by `order`; if the domain has
   no lists, create a `"Notes"` list (same fallback the widget already uses).
3. Append a new item via `makeItem({ url: <canonical page url>, order: nextOrder })`
   — **blank `text`**, `url` set.
4. Persist, then focus the new item's text input (the existing inline-edit flow)
   so the user can immediately type a title.

## Cross-list move + list reorder (full-page app only)

Implemented over **tested pure helpers** in `src/lib/model.js`, with the app
wiring drag/drop to them (keeps UI thin and gives unit coverage).

### New pure helpers (model.js)

- `moveItem(bucket, fromListId, toListId, itemId, toIndex): bucket`
  Returns a **new** bucket (non-mutating, like `mergeStores`) with the item
  removed from `fromListId` and inserted into `toListId` at `toIndex`; `order`
  reassigned sequentially (0..n-1) in both affected lists. `fromListId ===
  toListId` handles plain within-list reordering, so the app routes **all** item
  drops through this one function. No-ops (returns an equivalent bucket) if ids
  are missing.
- `reorderLists(bucket, orderedListIds): bucket`
  Returns a new bucket whose lists are ordered to match `orderedListIds`, with
  `order` reassigned 0..n-1. List ids not present in `orderedListIds` keep their
  relative order at the end (defensive).

### App drag/drop behavior

- **Item drag:** drop onto another item → `moveItem(bucket, srcList, destList,
  srcItem, destIndex)`. Cross-list moves allowed **within the same domain**
  (`src.key === key`); cross-domain drops are ignored. Dropping onto an empty
  list area / list header appends to that list.
- **List drag:** list blocks become draggable; dropping one list onto another
  reorders via `reorderLists`. Within a single domain.
- Persists the affected domain bucket with one `setDomain` call.

## Files touched

```
src/lib/model.js     # + moveItem, reorderLists (pure, tested)
src/popup/popup.js    # details panel (link+notes), 🔗/📝 indicators, "save this page"
src/popup/popup.css    # details-panel styles
src/app/app.js        # details panel (link+notes, no "use this page"), cross-list move + list reorder
src/app/app.css       # details-panel + list-drag styles
test/model-move.test.js # unit tests for moveItem + reorderLists
```
(No manifest change. Widget files untouched this milestone.)

## Testing strategy

- **Unit (Node):** `moveItem` and `reorderLists` — within-list reorder,
  cross-list move with order reassignment, append-to-empty-list, missing-id
  no-op, and **non-mutation of the input bucket** (snapshot compare, matching the
  pattern used for `mergeStores`).
- **Manual (browser, deferred to end):** details panel link/notes edit + 🔗/📝
  indicators persist and sync across popup/app; "save this page" adds a
  url-bearing item and focuses it; drag an item to another list and reorder
  lists in the app; export/import still round-trips `url`/`note`.

## Error handling / edge cases

- Non-`http(s)` URL entered in the Link field: stored, but not rendered as a
  clickable 🔗 (existing `isHttpUrl` guard) — no execution risk.
- "Save this page" on a non-web tab: action hidden/disabled.
- Empty notes/link inputs persist as `null` so indicators clear correctly.
- `moveItem`/`reorderLists` never throw on unknown ids; they return the bucket
  unchanged.

## Roadmap context (for later milestones — not this spec)

M2 capture-from-anywhere (context menu, shortcuts) · M3 due dates + reminders ·
M4 tags + sort/archive · M5 sync + scheduled backup + Markdown export ·
M6 polish (dark mode, persisted UI state, undo-delete, favicons). Each is its own
spec → plan → build cycle.
