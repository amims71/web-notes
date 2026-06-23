# Milestone 6 — Final Polish (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Part of:** the roadmap (M1–M5 shipped; v1.0.0 released). Final milestone.

## Summary

Four polish bundles drawn from review findings: **dark mode**, **small cleanups**
(drag off under non-Manual sort, dedupe the Archived-view Restore, a download
helper that revokes object URLs), **persisted UI state** (list collapse, widget
corner), and **data safety** (popup flush-on-close, undo-delete). No new
permissions; no item-model change (reuses `list.collapsed`; adds
`meta.settings.widgetCorner`).

## Decisions (locked from brainstorming)

| Bundle | Decision |
| --- | --- |
| Dark mode | Auto via `prefers-color-scheme`; CSS-variable palette across popup/app/widget; no toggle. |
| Small cleanups | Item drag only when `sort === "manual"`; hide the details-panel Archive/Restore button in the Archived view (inline Restore stays); shared `download()` helper with `URL.revokeObjectURL`. |
| Persisted UI | Popup list collapse via `list.collapsed`; widget corner via `meta.settings.widgetCorner`. |
| Data safety | Popup `visibilitychange→hidden` flush; undo-delete snackbar in popup **and** full app. |
| Favicons | Out of scope (would need a favicon permission / external request). |

## 1. Dark mode (CSS only — `popup.css`, `app.css`, `widget.css`)

Refactor each stylesheet to drive colors from CSS variables, then override them in
a dark media block. Variable set (names shared across files; values per file as
needed): `--bg`, `--fg`, `--muted`, `--line`, `--accent` (was `--indigo`),
`--chip-bg`, `--chip-ro-bg`, `--danger`, `--field-bg`.

Light values (current): `--bg:#fff; --fg:#111; --muted:#6b7280; --line:#e5e7eb;
--accent:#4f46e5; --chip-bg:#eef2ff; --chip-ro-bg:#f3f4f6; --danger:#dc2626;
--field-bg:#fff`.

Dark values (in `@media (prefers-color-scheme: dark)`): `--bg:#1f2024;
--fg:#e5e7eb; --muted:#9ca3af; --line:#3a3b40; --accent:#818cf8;
--chip-bg:#312e81; --chip-ro-bg:#374151; --danger:#f87171; --field-bg:#26272c`.

Mechanics: replace hardcoded color literals in each file with `var(--…)`
(backgrounds → `--bg`/`--field-bg`, text → `--fg`/`--muted`, borders → `--line`,
indigo → `--accent`, chip backgrounds → `--chip-bg`/`--chip-ro-bg`, reds →
`--danger`). Inputs/textareas/selects use `--field-bg`/`--fg`/`--line`. The widget
keeps `--accent` for its bubble; its panel uses `--bg`/`--fg`. Keep the existing
`scrollbar-gutter: stable` on the popup body. The widget's dark block lives in
`widget.css` (applies inside the shadow root).

## 2. Small cleanups (`src/app/app.js`)

- **Drag under sort:** in `renderItem`, set the row `draggable` to
  `state.sort === "manual"` (drop handlers may stay; with `draggable=false` they
  won't fire). List-header drag (list reorder) is unchanged (always on).
- **Dedupe Restore:** in `detailsPanel`, render the Archive/Restore button only
  when `!state.archivedView` (the inline Restore in `renderItem` already covers the
  Archived view). In normal views the panel button still archives.
- **Download helper:** add `function download(filename, text, type)` that builds a
  Blob, an object-URL anchor, clicks it, removes it, and calls
  `URL.revokeObjectURL(url)`. Refactor the JSON export and the `.md` export
  handlers to call it. (Self-contained to app.js; no shared module needed.)

## 3. Persisted UI state

- **Popup list collapse (`src/popup/popup.js`):** the list-head toggle sets
  `list.collapsed = !list.collapsed` and `save()` (instead of only flipping a DOM
  `hidden`); `render()` sets the list body hidden from `list.collapsed`. (`makeList`
  already initializes `collapsed:false`; field already validates/round-trips.)
- **Widget corner (`src/content/widget.js`):** on mount, initialize `corner` from
  `meta.settings.widgetCorner` if present (read via a `getMeta` dynamic import or
  from storage); on drag-end, persist the new corner to
  `meta.settings.widgetCorner` via `setMeta`. Falls back to the default corner.

## 4. Data safety

- **Popup flush-on-close (`src/popup/popup.js`):** add
  `document.addEventListener("visibilitychange", () => { if
  (document.visibilityState === "hidden") save(); })` so an in-memory link/note
  edit (already applied to the item via `oninput`) is persisted if the popup closes
  before the input blurs. Best-effort (storage writes are async) but closes the
  common gap; complements the existing `onchange` blur-save.
- **Undo-delete (popup + full app):** on item delete, instead of dropping silently,
  stash `{ item, listId, index }`, remove the item, `save()`/`setDomain`, and show a
  small **snackbar** ("Deleted · Undo") for ~5 s. **Undo** re-inserts the item at
  its original index in its list (and re-saves); the timeout dismisses the snackbar.
  Each surface implements its own snackbar element (no shared UI module). Undo
  restores the exact item object (preserving id/fields); order is normalized by the
  existing render sort.

## Non-goals

- No theme toggle (OS-driven only).
- No favicons in the rail.
- No undo for list deletion or for archive (only item delete).
- No widget dark-mode toggle independent of OS.
- No new permissions; no item-model field additions (reuse `list.collapsed`;
  `meta.settings.widgetCorner` is settings, not item data).

## Error handling / edge cases

- `prefers-color-scheme` unsupported → light values (the `:root` defaults) apply.
- `meta.settings.widgetCorner` absent/malformed → default corner; guard with
  `meta.settings?.widgetCorner`.
- Undo after the timeout (snackbar gone) → no-op (pending cleared).
- Deleting a second item before undoing the first → the first pending is committed
  (snackbar replaced); only the most recent delete is undoable. State it.
- Flush-on-close when nothing changed → a redundant `save()` write; harmless.

## Testing strategy

- Mostly UI/CSS — no new pure logic that warrants unit tests; the existing 52-test
  suite must stay green (run `npm test` after each task).
- Static: `node --check` on each modified JS file; confirm CSS files have no
  `<style>` tags and remain plain CSS.
- **Manual (deferred to end):** toggle OS dark mode → all three surfaces adapt;
  item drag disabled unless Sort=Manual; one Restore in Archived view; exports
  still download; collapsed lists persist across popup reopen; widget stays in its
  moved corner after reload; type a note and close the popup → it persists; delete
  an item → Undo restores it.

## Files touched

```
src/popup/popup.css      # variable palette + dark media
src/app/app.css          # variable palette + dark media
src/content/widget.css   # variable palette + dark media (shadow root)
src/app/app.js           # drag-under-sort, dedupe Restore, download() helper, undo-delete snackbar
src/popup/popup.js       # list.collapsed persist, visibilitychange flush, undo-delete snackbar
src/content/widget.js    # widget corner persistence (meta.settings.widgetCorner)
```

## Likely task split (for the plan)

1. Dark mode — variable palettes + dark media in popup.css, app.css, widget.css.
2. Small cleanups — app.js (drag-under-sort, dedupe Restore, download helper).
3. Persisted UI — popup list.collapsed + widget corner.
4. Data safety — popup flush-on-close + undo-delete (popup + app).

## Release note

After M6, cut **v1.1.0** (M1–M6) — version bump, tag, GitHub release + zip.
