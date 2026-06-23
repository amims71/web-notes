# Milestone 3 — Due Dates & Reminders (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Part of:** the multi-milestone roadmap (M1, M2 shipped).

## Summary

Give items an optional **due date/time**, an optional **reminder lead time**, and
optional **recurrence** (daily/weekly). A background alarm sweeps for items whose
reminder moment has arrived and shows a **system notification** (clicking it opens
the item's link, or the full app). Items show a **📅 due label** and **overdue**
styling. The scheduling core is pure and unit-tested; the background worker wires
Chrome `alarms`/`notifications` to it. The floating widget is untouched.

## Decisions (locked from brainstorming)

| Topic | Decision |
| --- | --- |
| Granularity | **Date + time** (`datetime-local`); reminders ~1-min accurate. |
| Recurrence | **Allowed**: none / daily / weekly. |
| Reminder timing | **Lead time before due**: at-time / 5m / 30m / 1h / 1d (preset dropdown). |
| Notification click | **Open the item's link** if http(s); else open the full-page app. |
| Feedback | System notification + the existing badge (open count, already includes the item). |
| New permissions | **`notifications`, `alarms`.** |

## Data-model additions (per item; all nullable, absence ≡ null — no migration)

- `due`: epoch ms of the due date/time, or `null`.
- `remindLead`: integer **minutes before `due`** to fire (`0` = at due time), or `null` (treated as 0).
- `repeat`: `null | "daily" | "weekly"`.

`makeItem` defaults all three to `null`. `validateBucket` accepts `due`/`remindLead`
as `null`-or-`number` and `repeat` as `null`-or-`string`. All three round-trip
through export/import.

## Scheduling core (pure, unit-tested — `src/lib/model.js`)

- `reminderTime(item): number | null` → `due == null ? null : due - (remindLead || 0) * 60000`.
- `nextOccurrence(due, repeat, now): number` → for `"daily"`/`"weekly"`, advance
  `due` by 1/7 days repeatedly until strictly **after `now`**; return that ms. (Used
  to roll a recurring item forward; not called for `repeat == null`.)
- `dueState(item, now): "none" | "upcoming" | "overdue"` → `none` if no due or done;
  `overdue` if `due <= now`; else `upcoming`.
- `sweepDue(bucket, lastCheck, now): { due: Item[], bucket }` → returns the items
  that fire this sweep (not done, `reminderTime` in `(lastCheck, now]`) and a bucket
  with any **recurring** fired items rolled forward (`due = nextOccurrence(...)`),
  non-mutating. Returns the **same bucket reference** when nothing rolled forward
  (so the worker only writes when needed). One-shot items simply stop firing once
  their reminder time is `<= lastCheck`.

Relative-label formatting (e.g. "in 2h", "tomorrow", "overdue") lives in the UI
(`Date`/timezone dependent); `dueState` carries the tested logic.

## Reminder engine (`src/background.js`)

- A single periodic alarm **`due-check`** (`periodInMinutes: 1`), created in
  `runtime.onInstalled` and re-ensured in `runtime.onStartup` (idempotent —
  `alarms.create` replaces by name).
- `alarms.onAlarm` (name `due-check`) runs the sweep:
  1. `meta = getMeta()`; `lastCheck = meta.settings.lastDueCheck`; `now = Date.now()`.
  2. **First run** (`lastCheck` undefined): set `lastDueCheck = now` and return — no
     retroactive notifications for items already past due at install/upgrade.
  3. For each domain bucket: `{ due, bucket: nb } = sweepDue(bucket, lastCheck, now)`;
     create a notification per fired item; if `nb !== bucket`, `setDomain(key, nb)`.
  4. `meta.settings.lastDueCheck = now`; `setMeta(meta)`.
- **Notification:** `chrome.notifications.create(id, { type: "basic", iconUrl:
  "icons/128.png", title: <item text, truncated>, message: <domain> })`. The `id`
  encodes the click target statelessly: `isHttpUrl(item.url) ? item.url :
  "webnotes:app:" + item.id`.
- **`notifications.onClicked(id)`:** if `id` starts with `http` → `tabs.create({url:
  id})`; else `tabs.create({ url: runtime.getURL("src/app/app.html") })`; then
  `notifications.clear(id)`.
- Badge semantics are unchanged (still the domain open count).

## UI — due fields & indicators (popup + full app)

In the existing ▸ **details panel** (added in M1), below Link and Notes:
- **Due** — a `datetime-local` input bound to `item.due` (epoch ms ↔ local input
  string via small UI helpers), plus a ✕ to clear.
- **Remind** — a `<select>`: At time (0) / 5 min / 30 min / 1 hour / 1 day before →
  stored as `remindLead` minutes.
- **Repeat** — a `<select>`: None / Daily / Weekly → `repeat`.
- Editing any of these bumps `item.updatedAt` and persists (same pattern as M1).

On the **item row**: when `due` is set, show **📅 + a relative label** (`dueState`
drives an `overdue` CSS class — red — for past-due, not-done items). Shown in both
the popup and the full app.

## Non-goals (this milestone)

- No reminder snooze/dismiss UI (clicking the notification just opens the target).
- No per-occurrence history for recurring items (the `due` simply rolls forward).
- No changes to the floating widget, storage layer, or scope module.
- No badge redefinition (stays open-count; overdue is surfaced via notification +
  in-app styling).

## Error handling / edge cases

- Worker asleep across several minutes: the alarm fires on wake; the sweep's
  `(lastCheck, now]` window catches every reminder missed in between.
- A recurring item whose worker missed multiple periods: fires **once** and rolls
  `due` to the next **future** occurrence (no notification spam).
- Setting a due in the past (before `lastCheck`): does not retroactively fire
  (treated as already elapsed) — acceptable.
- Marking an item done before its reminder: `sweepDue` skips done items.
- Notification id collisions (two link-less items firing the same minute): avoided
  by encoding `item.id` in the non-link id form.
- `notifications`/`alarms` unavailable (shouldn't happen with the permissions):
  guarded so the sweep never throws.

## Testing strategy

- **Unit (Node):** `reminderTime` (with/without lead); `nextOccurrence`
  (daily/weekly rolls strictly past `now`, including multi-period catch-up);
  `dueState` (none/upcoming/overdue, done suppresses); `sweepDue` (fires in window,
  ignores done/out-of-window, rolls recurring forward and returns a new bucket,
  returns same ref when nothing changes, non-mutating); `validateBucket` accepts/
  rejects `due`/`remindLead`/`repeat` types; `makeItem` defaults.
- **Manual (browser, deferred):** set a due ~1–2 min out with a lead → notification
  fires; click → opens link/app; overdue styling appears; daily/weekly rolls the
  due forward after firing; export/import preserves the fields.

## Files touched

```
manifest.json            # + notifications, alarms permissions
src/lib/model.js         # + due/remindLead/repeat on makeItem & validateBucket; reminderTime, nextOccurrence, dueState, sweepDue
src/background.js        # due-check alarm, sweep, notifications + onClicked
src/popup/popup.js + .css   # due/remind/repeat fields + 📅/overdue indicator
src/app/app.js + .css       # same
test/model-due.test.js   # unit tests for the scheduling core + validation
```
(Floating widget, storage.js, scope.js untouched.)

## Likely task split (for the plan)

1. Item fields (`due`/`remindLead`/`repeat`) on `makeItem` + `validateBucket` (TDD).
2. Scheduling helpers `reminderTime`/`nextOccurrence`/`dueState`/`sweepDue` (TDD).
3. Manifest perms + background alarm/sweep/notifications + click (static checks).
4. Due UI (fields + indicator + overdue styling) in popup and full app.

## Roadmap context (later)

M4 tags + sort/archive · M5 sync + scheduled backup + Markdown export · M6 polish.
