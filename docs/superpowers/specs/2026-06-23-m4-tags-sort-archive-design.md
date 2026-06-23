# Milestone 4 — Tags, Sort & Archive (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Part of:** the multi-milestone roadmap (M1–M3 + capture + widget indicators shipped).

## Summary

Add per-item **tags** (free-form, chip UI, left-rail filter in the full app),
**sort** options in the full app (Manual/Due/Created/Alpha), and a non-destructive
**Archive** (archived items hide from normal views and counts; an Archived rail
view restores them). Pure logic (`sortItems`, `allTags`, archive exclusion) is
unit-tested; UI follows the established popup/app patterns.

## Decisions (locked from brainstorming)

| Topic | Decision |
| --- | --- |
| Tags | Free-form `string[]` per item; chips on rows; edited in the details panel. |
| Tag filter | A **Tags section in the full-app left rail** (multi-select), below domains. |
| Tag match | **OR within tags** (item matches if it has ANY selected tag), **AND** with the domain filter. |
| Sort | Full-app toolbar dropdown: **Manual / Due / Created / Alphabetical**, within each list. |
| Archive | **Archive flag + Archived view** (non-destructive, reversible). |
| Widget | Excludes archived items; **no tag chips** this milestone. |

## Data-model additions (per item; defaulted; no migration)

- `tags`: `string[]`, default `[]`.
- `archived`: `boolean`, default `false`.

`makeItem` defaults both. `validateBucket` accepts items lacking them (old
backups): `(it.tags == null || (Array.isArray(it.tags) && it.tags.every(t => typeof t === "string")))`
and `(it.archived == null || typeof it.archived === "boolean")`. Both round-trip
through export/import. Code that reads tags uses `item.tags ?? []`.

## Archive semantics (cross-cutting)

Archived items are excluded everywhere except the full app's Archived view:
- `countOpenItems(bucket, …)` adds `&& !it.archived` (badge + widget bubble count).
- `sweepDue` skips archived items (no reminders fire for archived).
- Popup render, full-app normal tree, and the widget's `openItems` filter out
  archived items.
- Archived items appear only when the full app's **Archived** rail entry is active,
  each with a **Restore** action (`archived = false`).

## Tested pure helpers (`src/lib/model.js`)

- `sortItems(items, mode): Item[]` → a NEW sorted array (non-mutating):
  - `manual` → by `order` asc (current behavior).
  - `due` → by `due` asc, items without a due sorted last.
  - `created` → by `createdAt` asc.
  - `alpha` → by `text` (`localeCompare`, case-insensitive).
- `allTags(domainsMap): string[]` → sorted unique tags across all buckets' items.

## UI

### Details panel (popup + full app)

- **Tags row:** current tags as chips, each with an ✕ to remove; an input that adds
  a tag on Enter (trimmed, deduped, lower-cased for consistency). Persists with
  `updatedAt` bump.
- **Archive/Restore button:** archives the item (or restores it in the Archived
  view). Bumps `updatedAt`.

### Item rows (popup + full app)

- Small `#tag` chips rendered after the existing indicators (🔗/📝/📅).

### Full-page app

- **Left rail** gains, below the domain list:
  - a **Tags** section listing `allTags(...)` as multi-select chips/rows (same
    interaction as domains); selecting tags filters items to those having any
    selected tag, intersected with the domain filter.
  - an **Archived** entry; activating it switches the main panel to show only
    archived items (across the domain filter), each with **Restore**. While not
    active, archived items are hidden.
- **Toolbar** gains a **Sort** dropdown (Manual/Due/Created/Alpha); the chosen sort
  is applied within each list via `sortItems`. Default Manual.

### Widget

- `openItems()` adds `!it.archived`. No tag chips this milestone.

## Non-goals

- No tag rename/delete management UI (tags are implicit from item usage; removing a
  tag from all items removes it from the rail).
- No tag chips or archive action in the widget.
- No per-list or persisted sort preference (sort is a session toolbar control;
  default Manual on load).
- No bulk operations beyond per-item archive/restore.

## Error handling / edge cases

- Items from old backups lacking `tags`/`archived`: treated as `[]`/`false` via
  `?? []` / falsy checks; validation accepts them.
- Duplicate tag entry: deduped on add.
- Empty/whitespace tag: ignored.
- Archived item with a due date: excluded from `sweepDue` (no reminder) and from
  `countOpenItems`.
- Selecting a tag that no longer exists on any item: yields an empty result;
  `allTags` recomputes from current items each render so stale tags drop out.

## Testing strategy

- **Unit (Node):** `sortItems` (each mode incl. due-nulls-last and alpha case-
  insensitivity, non-mutating); `allTags` (unique + sorted across buckets);
  `countOpenItems` excludes archived; `sweepDue` skips archived; `makeItem`
  defaults; `validateBucket` accepts missing + valid tags/archived and rejects
  wrong types (non-array tags, non-string tag element, non-boolean archived).
- **Manual (deferred):** add/remove tags; chips render; rail tag filter + domain
  filter combine; sort dropdown reorders within lists; archive hides an item and
  drops the badge; Archived view lists it; restore returns it; export/import
  preserves tags/archived.

## Files touched

```
src/lib/model.js          # + tags/archived on makeItem & validateBucket; sortItems, allTags; archive exclusion in countOpenItems & sweepDue
src/popup/popup.js + .css  # tag row + chips + archive button; exclude archived
src/app/app.js + .css      # tag row + chips; rail Tags section + Archived view; sort dropdown; archive/restore; exclude archived
src/content/widget.js      # exclude archived from openItems
src/app/app.html           # sort dropdown control
test/model-tags.test.js    # sortItems, allTags, archive exclusion, validation
```

## Likely task split (for the plan)

1. Item fields `tags`/`archived` + `makeItem` + `validateBucket` (TDD).
2. `sortItems` + `allTags`; archive exclusion in `countOpenItems` + `sweepDue` (TDD).
3. Popup: tag row + chips + archive button + exclude archived.
4. Full app: tag chips + rail Tags section + Archived view + sort dropdown + archive/restore + exclude archived.
5. Widget: exclude archived from `openItems`.

## Roadmap context (later)

M5 sync + scheduled backup + Markdown export · M6 polish.
