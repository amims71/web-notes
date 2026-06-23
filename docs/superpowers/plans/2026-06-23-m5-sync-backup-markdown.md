# Milestone 5 — Sync, Backup & Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Markdown export (downloadable `.md`), an opt-in backup-reminder notification (Off/Daily/Weekly), and a discoverability hint that the existing JSON Export/Import-Merge is the cross-device "sync".

**Architecture:** A pure tested `toMarkdown(domains)` helper in `model.js`; full-app toolbar gains an Export-.md button and a Backup-reminder `<select>` (stored in `meta.settings`); the background adds a `backup-reminder` alarm that fires a notification reusing the existing `notifications.onClicked` (opens the app). No `chrome.storage.sync`, no new permissions, no item-model change.

**Tech Stack:** Vanilla ES modules, no build step. Node's built-in test runner. Existing `alarms`/`notifications`.

## Global Constraints

- **No build step**; load unpacked. **No new dependencies. No new permissions** (`alarms`/`notifications` already present). **No `chrome.storage.sync`.**
- **`model.js` stays PURE** (no `chrome`); `toMarkdown` is deterministic (UTC ISO) and non-mutating.
- **Markdown excludes archived items** (mirrors active views); JSON export stays the complete backup.
- **Backup reminder** lives in `meta.settings.backupReminder` (`"off"|"daily"|"weekly"`, default off) + `meta.settings.lastBackupReminderAt`. Guard `meta.settings ?? {}`.
- **Notification creation is awaited** before advancing `lastBackupReminderAt` (matches the M3 pattern). The backup notification id is `"webnotes:app:backup"` (non-http → the existing `onClicked` opens the app).
- **Code comments:** only what isn't obvious; match density; no narration.
- **Commit** after each task.

---

### Task 1: `model.js` — `toMarkdown` (TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-markdown.test.js`

**Interfaces:**
- Produces: `toMarkdown(domainsMap): string` — deterministic Markdown of all non-archived items; `""` for empty/all-archived.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, toMarkdown } from "../src/lib/model.js";

const mkItem = (over, id) => ({ ...makeItem({ text: over.text ?? id }, { id, now: 1 }), ...over });

test("toMarkdown renders domains/lists/items and excludes archived", () => {
  const b = makeDomainBucket("a.com");
  const l1 = makeList("Bugs", { id: "l1" }); l1.order = 0;
  l1.items = [
    mkItem({ text: "fix it", done: false, url: "https://a.com/x", due: 1000000000000, tags: ["urgent"], note: "asap", order: 0 }, "i1"),
    mkItem({ text: "done one", done: true, order: 1 }, "i2"),
    mkItem({ text: "hidden", archived: true, order: 2 }, "i3"),
  ];
  const l2 = makeList("Empty", { id: "l2" }); l2.order = 1;
  l2.items = [mkItem({ text: "x", archived: true }, "i4")];
  b.lists = [l1, l2];
  const md = toMarkdown({ "d:a.com": b });
  assert.equal(md, [
    "# a.com",
    "",
    "## Bugs",
    "",
    "- [ ] fix it [link](https://a.com/x) (due 2001-09-09T01:46Z) #urgent",
    "  note: asap",
    "- [x] done one",
    "",
  ].join("\n"));
});

test("toMarkdown returns empty string for empty or all-archived store", () => {
  assert.equal(toMarkdown({}), "");
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [mkItem({ archived: true }, "i1")];
  b.lists = [l];
  assert.equal(toMarkdown({ "d:a.com": b }), "");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-markdown.test.js`
Expected: FAIL — `toMarkdown` not exported.

- [ ] **Step 3: Append `toMarkdown` to `src/lib/model.js`**

```js
export function toMarkdown(domainsMap) {
  const lines = [];
  for (const key of Object.keys(domainsMap ?? {}).sort()) {
    const bucket = domainsMap[key];
    const lists = [...(bucket.lists ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!lists.some((l) => (l.items ?? []).some((i) => !i.archived))) continue;
    lines.push(`# ${bucket.domain}`, "");
    for (const list of lists) {
      const items = [...(list.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((i) => !i.archived);
      if (!items.length) continue;
      lines.push(`## ${list.name}`, "");
      for (const item of items) {
        let line = `- [${item.done ? "x" : " "}] ${item.text}`;
        if (item.url) line += ` [link](${item.url})`;
        if (item.due != null) line += ` (due ${new Date(item.due).toISOString().slice(0, 16)}Z)`;
        if ((item.tags ?? []).length) line += " " + item.tags.map((t) => "#" + t).join(" ");
        lines.push(line);
        if (item.note) lines.push(`  note: ${item.note}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model-markdown.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.js test/model-markdown.test.js
git commit -m "feat: add toMarkdown export helper"
```

---

### Task 2: Full app — Export .md, Backup-reminder setting, sync hint

**Files:**
- Modify: `src/app/app.js`
- Modify: `src/app/app.html`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `toMarkdown` (model.js, add to import); `getMeta`, `setMeta` (storage.js, add to import); existing `el`, `state`, `reload`.
- Produces: full-app UI for Markdown export + backup-reminder + sync hint.

Read `src/app/app.js` and `src/app/app.html` first.

- [ ] **Step 1: Update imports** — add `toMarkdown` to the `from "../lib/model.js"` import; add `getMeta, setMeta` to the `from "../lib/storage.js"` import.

- [ ] **Step 2: Add a module-level `meta`** — after the `export const state = {...}` line, add:

```js
let meta = null;
```

- [ ] **Step 3: Load meta in `reload` and reflect the backup setting** — change `reload` to:

```js
export async function reload() {
  state.domains = await getAllDomains();
  meta = await getMeta();
  $("backup").value = meta.settings?.backupReminder ?? "off";
  render();
}
```

- [ ] **Step 4: Add the toolbar controls** — in `src/app/app.html`, inside the header, after the Import button/input, add:

```html
      <button id="export-md" class="btn">⬇ .md</button>
      <label>Backup
        <select id="backup">
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      <span class="sync-hint" title="Export a backup here, then Import → Merge on another device to sync.">↔ sync via Export/Import</span>
```

- [ ] **Step 5: Wire the handlers** — in `src/app/app.js`, near the other control handlers (e.g. after the `$("import-file").onchange` block), add:

```js
$("export-md").onclick = () => {
  const blob = new Blob([toMarkdown(state.domains)], { type: "text/markdown" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `web-notes-${new Date().toISOString().slice(0, 10)}.md` });
  document.body.append(a);
  a.click();
  a.remove();
};

$("backup").onchange = async (e) => {
  meta.settings = meta.settings ?? {};
  meta.settings.backupReminder = e.target.value;
  if (e.target.value !== "off") meta.settings.lastBackupReminderAt = Date.now();
  await setMeta(meta);
};
```

- [ ] **Step 6: Add CSS** — append to `src/app/app.css`:

```css
.sync-hint { font-size: 12px; color: var(--muted); cursor: help; }
```

- [ ] **Step 7: Static checks**

Run: `node --check src/app/app.js`
Expected: exits 0.
Run: `grep -c "export-md" src/app/app.html` and `grep -c "id=\"backup\"" src/app/app.html`
Expected: each ≥ 1.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 8: Commit**

```bash
git add src/app/app.js src/app/app.html src/app/app.css
git commit -m "feat: add Markdown export, backup-reminder setting, and sync hint to full app"
```

> In-browser verification (Export .md downloads a readable file; the Backup select persists; the hint tooltip shows) is deferred to the end-of-milestone manual pass.

---

### Task 3: Background — backup-reminder alarm

**Files:**
- Modify: `src/background.js`

**Interfaces:**
- Consumes: `getMeta`, `setMeta` (already imported in background.js).
- Produces: the backup-reminder firing behavior.

Read `src/background.js` first.

- [ ] **Step 1: Create the alarm on install + startup** — in the `chrome.runtime.onInstalled` listener (right after the existing `chrome.alarms.create("due-check", ...)`), add:

```js
  chrome.alarms.create("backup-reminder", { periodInMinutes: 1440 });
```

And in the `chrome.runtime.onStartup` listener (right after its `due-check` create), add the same line:

```js
  chrome.alarms.create("backup-reminder", { periodInMinutes: 1440 });
```

- [ ] **Step 2: Handle the alarm** — in the existing `chrome.alarms.onAlarm` listener, extend it to also handle `backup-reminder`:

```js
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "due-check") await runDueSweep();
  else if (alarm.name === "backup-reminder") await runBackupReminder();
});
```

- [ ] **Step 3: Add `runBackupReminder`** — append to `src/background.js`:

```js
async function runBackupReminder() {
  const meta = await getMeta();
  meta.settings = meta.settings ?? {};
  const setting = meta.settings.backupReminder ?? "off";
  if (setting === "off") return;
  const now = Date.now();
  const last = meta.settings.lastBackupReminderAt;
  if (last == null) {
    meta.settings.lastBackupReminderAt = now;
    await setMeta(meta);
    return;
  }
  const interval = (setting === "weekly" ? 7 : 1) * 86400000;
  if (now - last < interval) return;
  await chrome.notifications.create("webnotes:app:backup", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: "Back up your Web Notes",
    message: "Open Web Notes to export a backup.",
  });
  meta.settings.lastBackupReminderAt = now;
  await setMeta(meta);
}
```

- [ ] **Step 4: Static checks**

Run: `node --check src/background.js`
Expected: exits 0.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 5: Commit**

```bash
git add src/background.js
git commit -m "feat: add backup-reminder alarm and notification"
```

> In-browser verification (set Backup=Daily, confirm a reminder notification fires per the cadence and clicking opens the app) is deferred to the end-of-milestone manual pass.

---

## Self-Review

**Spec coverage:**
- Markdown export-only, excludes archived, deterministic, `""` for empty → Task 1. ✓
- Export .md button (download) → Task 2. ✓
- Backup-reminder setting (Off/Daily/Weekly) in `meta.settings`, sets `lastBackupReminderAt` on enable → Task 2. ✓
- Background backup-reminder alarm; off→return; first-observation defers; cadence via `lastBackupReminderAt`; awaited notification; reuses `onClicked` (opens app) → Task 3. ✓
- File-based sync hint (discoverability) → Task 2 Step 4. ✓
- No new permissions; no `chrome.storage.sync`; no item-model change → confirmed (no manifest/model edits). ✓

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `toMarkdown(domainsMap)` defined in Task 1, consumed in Task 2. `meta.settings.backupReminder` / `lastBackupReminderAt` written in Task 2 and read in Task 3 with matching values (`"off"|"daily"|"weekly"`). Backup notification id `"webnotes:app:backup"` is non-http, so the existing `notifications.onClicked` (id.startsWith("http") ? url : app.html) opens the app — consistent. `getMeta`/`setMeta` already imported in background; added to app import in Task 2.

**Note:** the M3 `notifications.onClicked` handler already routes non-http ids to the app, so no change there is needed for the backup notification. The backup alarm shares the existing `onAlarm` listener (extended, not duplicated).
