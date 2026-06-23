# Milestone 5 — Sync, Backup & Markdown (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Part of:** the roadmap (M1–M4 shipped; v1.0.0 released).

## Summary

Add **Markdown export** (a downloadable `.md` of the active notes) and a
**backup reminder** (an opt-in periodic notification nudging you to export).
**File-based sync** is already provided by the existing JSON Export → Import
(Merge) flow (`mergeStores`, newer-item-wins) — this milestone only adds a small
in-app hint making that discoverable as a cross-device method. No
`chrome.storage.sync`, no new permissions.

## Decisions (locked from brainstorming)

| Topic | Decision |
| --- | --- |
| Bundling | All three together in M5. |
| Sync | **File-based** — already implemented by Export/Import (Merge). Only a discoverability hint is added; no sync engine, no `chrome.storage.sync`. |
| Backup | **Reminder to export** — opt-in periodic notification (Off/Daily/Weekly). |
| Markdown | **Export only** (import stays JSON). |
| Markdown content | **Excludes archived** items (mirrors active views); JSON export remains the complete backup. |
| Permissions | None new (`alarms`/`notifications` already present). |

## Markdown export (NEW)

A pure, tested helper in `src/lib/model.js`:

`toMarkdown(domainsMap): string` — renders, for each domain (sorted by key) that
has at least one non-archived item:

```
# <domain>

## <list name>

- [ ] <text> [link](<url>) (due <ISO-min>Z) #tag1 #tag2
  note: <note>
- [x] <done text>
```

Rules: lists sorted by `order`; non-archived items only, sorted by `order`;
`- [x]`/`- [ ]` from `done`; append ` [link](url)` when `url` is set,
` (due <new Date(due).toISOString().slice(0,16)>Z)` when `due` set,
` #tag` per tag; a `note` becomes an indented `  note: …` line. Domains/lists
with no non-archived items are skipped. Deterministic (UTC ISO), so it is
unit-tested against an exact expected string.

The full-app toolbar gains an **"Export .md"** button: `toMarkdown(state.domains)`
→ Blob → download `web-notes-<date>.md` (same download pattern as JSON export;
`URL.createObjectURL`).

## Backup reminder (NEW)

**Settings (in `meta.settings`):**
- `backupReminder`: `"off" | "daily" | "weekly"` (default `"off"` — undefined ≡ off).
- `lastBackupReminderAt`: epoch ms of the last reminder shown.

**Full-app control:** a **Backup reminder** `<select>` (Off / Daily / Weekly) in
the toolbar, reflecting `meta.settings.backupReminder`. On change it writes
`meta.settings.backupReminder` and, when switching to daily/weekly, sets
`lastBackupReminderAt = Date.now()` (so the clock starts then), via `setMeta`.

**Background:** a `backup-reminder` alarm (`periodInMinutes: 1440`), created in
`onInstalled` + `onStartup` alongside `due-check`. On fire:
- read meta; `setting = meta.settings?.backupReminder ?? "off"`; if `off`, return.
- `last = meta.settings.lastBackupReminderAt`; if `last == null`, set it to `now`
  and return (don't fire on first observation).
- `interval = setting === "weekly" ? 7·day : day`; if `now - last >= interval`,
  show a notification (id `"webnotes:app:backup"`, title "Back up your Web Notes",
  message "Open Web Notes to export a backup.") and set `lastBackupReminderAt = now`.

The notification reuses the existing `notifications.onClicked` handler: the id
does not start with `http`, so clicking opens the full-page app (where Export
lives). No new permission.

## File-based sync (ALREADY PROVIDED)

The existing flow already is cross-device sync: **Export** the JSON on device A,
move the file (Drive/Dropbox/etc.), **Import → Merge** on device B —
`mergeStores` reconciles item-by-item (newer `updatedAt` wins). This milestone
adds only a **one-line hint** in the full-app toolbar/near Import, e.g. a `title`
or small helper text: "Tip: Export here, then Import → Merge on another device to
sync." No new code paths.

## Non-goals

- No `chrome.storage.sync` / live auto-sync.
- No Markdown import (parsing is lossy).
- No auto-download backups or in-storage restore points (we chose the reminder).
- No new permissions; no item-model change.

## Error handling / edge cases

- Empty store: `toMarkdown` returns `""`; the Export .md still downloads an empty
  file (acceptable) — or the button no-ops on empty; either is fine (spec: produce
  the string; UI downloads it).
- `backupReminder` unset/`"off"`: alarm fires but the handler returns immediately.
- First enable: `lastBackupReminderAt` set to now (on change and/or first alarm
  observation) so no immediate reminder.
- Old `meta` without `settings`: guarded with `meta.settings ?? {}` before access.

## Testing strategy

- **Unit (Node):** `toMarkdown` against an exact expected string — covers headings,
  checkbox state, link/due/tags inline, note line, archived exclusion, empty store
  (`""`), domain/list skipping when empty.
- **Manual (deferred):** Export .md downloads a readable file; set Backup reminder
  to Daily and confirm (with a shortened interval if needed) the notification fires
  and opens the app; the sync hint is visible.

## Files touched

```
src/lib/model.js        # + toMarkdown (pure, tested)
src/app/app.js + .html + .css  # Export .md button; Backup reminder select (meta read/write); sync hint
src/background.js        # backup-reminder alarm + handler (reuses notifications.onClicked)
test/model-markdown.test.js  # toMarkdown
```

## Likely task split (for the plan)

1. `toMarkdown` pure helper (TDD).
2. Full app: Export .md button + Backup reminder setting (meta read/write) + sync hint.
3. Background: backup-reminder alarm + notification.

## Roadmap context

M6 polish (dark mode, persisted UI state, undo-delete, favicons, drag-under-sort,
redundant Restore, details-panel flush) — the final milestone.
