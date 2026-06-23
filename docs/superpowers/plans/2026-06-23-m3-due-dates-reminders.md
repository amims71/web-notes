# Milestone 3 — Due Dates & Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-item due date/time, reminder lead time, and recurrence (daily/weekly); fire system notifications via a background alarm; show due/overdue indicators in the popup and full app.

**Architecture:** New nullable item fields (`due`/`remindLead`/`repeat`) and a pure, unit-tested scheduling core (`reminderTime`/`nextOccurrence`/`dueState`/`sweepDue`) in `model.js`; the background service worker runs a 1-minute `chrome.alarms` sweep that fires `chrome.notifications`; popup/app expose the fields in the existing details panel and render a 📅/overdue flag.

**Tech Stack:** Vanilla ES modules, no build step. Node's built-in test runner. Chrome MV3 `alarms` + `notifications`.

## Global Constraints

- **No build step**; load unpacked. **No new dependencies.**
- **`model.js` stays PURE** (no `chrome`); new helpers are **non-mutating** where they return buckets.
- **New permissions:** `notifications`, `alarms` only.
- **New item fields are nullable; absence ≡ null** (no migration). `validateBucket` must accept items that **lack** these fields (use `== null`, which matches `undefined` and `null`), and reject wrong types.
- **Reminder time** = `due − remindLead·60000` (`remindLead` null ≡ 0). **Overdue** is keyed off `due`, not the reminder time.
- **Recurring** items roll `due` forward to the next **future** occurrence on fire (fire once, no spam). One-shots stop firing once their reminder time ≤ `lastDueCheck`.
- **First sweep** (no `lastDueCheck`) sets it to `now` and fires nothing (no retroactive notifications).
- **Notification id** encodes the click target: `isHttpUrl(url) ? url : "webnotes:app:"+id`. Click opens the link or the full app.
- **Badge semantics unchanged** (open count). **Floating widget, storage.js, scope.js untouched.**
- **Code comments:** only what isn't obvious; match density; no narration.
- **Commit** after each task. Small commits.

---

### Task 1: `model.js` — item fields `due`/`remindLead`/`repeat` + validation (TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-due-fields.test.js`

**Interfaces:**
- Consumes: existing `makeItem`, `makeDomainBucket`, `makeList`, `validateBucket`.
- Produces: `makeItem` now sets `due`/`remindLead`/`repeat` (default `null`); `validateBucket` accepts/rejects them.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeDomainBucket, makeList, validateBucket } from "../src/lib/model.js";

test("makeItem defaults due/remindLead/repeat to null and keeps provided values", () => {
  const d = makeItem({ text: "x" }, { id: "i", now: 1 });
  assert.equal(d.due, null);
  assert.equal(d.remindLead, null);
  assert.equal(d.repeat, null);
  const e = makeItem({ text: "y", due: 1000, remindLead: 30, repeat: "daily" }, { id: "j", now: 1 });
  assert.equal(e.due, 1000);
  assert.equal(e.remindLead, 30);
  assert.equal(e.repeat, "daily");
});

test("validateBucket accepts items missing the new fields (old backups)", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items.push({ id: "i1", text: "t", done: false, url: null, note: null, pageUrl: null, createdAt: 1, updatedAt: 1, order: 0 });
  b.lists.push(l);
  assert.equal(validateBucket(b), true);
});

test("validateBucket accepts valid new fields and rejects wrong types", () => {
  const ok = makeDomainBucket("a.com");
  const lo = makeList("L", { id: "l1" });
  lo.items.push(makeItem({ text: "t", due: 1000, remindLead: 5, repeat: "weekly" }, { id: "i1", now: 1 }));
  ok.lists.push(lo);
  assert.equal(validateBucket(ok), true);

  const mk = (over) => {
    const b = makeDomainBucket("a.com");
    const l = makeList("L", { id: "l1" });
    l.items.push({ ...makeItem({ text: "t" }, { id: "i1", now: 1 }), ...over });
    b.lists.push(l);
    return b;
  };
  assert.equal(validateBucket(mk({ due: "soon" })), false);
  assert.equal(validateBucket(mk({ remindLead: "5" })), false);
  assert.equal(validateBucket(mk({ repeat: 7 })), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-due-fields.test.js`
Expected: FAIL — `makeItem` doesn't set the fields / `validateBucket` doesn't check them.

- [ ] **Step 3: Add fields to `makeItem`** — in `src/lib/model.js`, add three lines to the object returned by `makeItem` (after `order: fields.order ?? 0,`):

```js
    due: fields.due ?? null,
    remindLead: fields.remindLead ?? null,
    repeat: fields.repeat ?? null,
```

- [ ] **Step 4: Extend `validateBucket`** — in the item predicate inside `validateBucket`, append these three clauses to the `.every(...)` condition (after the existing `note` clause):

```js
      && (it.due == null || typeof it.due === "number")
      && (it.remindLead == null || typeof it.remindLead === "number")
      && (it.repeat == null || typeof it.repeat === "string")
```

(Use `== null` — not `=== null` — so items from older backups that lack these fields still validate.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/model-due-fields.test.js`
Expected: all PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/model.js test/model-due-fields.test.js
git commit -m "feat: add due/remindLead/repeat item fields with validation"
```

---

### Task 2: `model.js` — scheduling helpers (TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-due.test.js`

**Interfaces:**
- Consumes: existing item shape; Task 1 fields.
- Produces:
  - `reminderTime(item): number | null` — `due − remindLead·60000`, or null when no due.
  - `nextOccurrence(due, repeat, now): number` — next occurrence strictly after `now` (step: daily = 86400000 ms, weekly = 604800000 ms).
  - `dueState(item, now): "none" | "upcoming" | "overdue"`.
  - `sweepDue(bucket, lastCheck, now): { due: Item[], bucket }` — fired items + a non-mutating bucket with recurring fired items rolled forward; returns the same bucket reference when nothing rolls forward.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, reminderTime, nextOccurrence, dueState, sweepDue } from "../src/lib/model.js";

const DAY = 86400000, MIN = 60000;

test("reminderTime subtracts the lead, null when no due", () => {
  assert.equal(reminderTime(makeItem({ text: "x" }, { id: "a", now: 1 })), null);
  assert.equal(reminderTime(makeItem({ text: "x", due: 1000000 }, { id: "a", now: 1 })), 1000000);
  assert.equal(reminderTime(makeItem({ text: "x", due: 1000000, remindLead: 30 }, { id: "a", now: 1 })), 1000000 - 30 * MIN);
});

test("nextOccurrence rolls strictly past now (incl. multi-period catch-up)", () => {
  const base = 1000 * DAY;
  assert.equal(nextOccurrence(base, "daily", base), base + DAY);
  assert.equal(nextOccurrence(base, "daily", base + 3 * DAY + 5), base + 4 * DAY);
  assert.equal(nextOccurrence(base, "weekly", base + 1), base + 7 * DAY);
});

test("dueState reflects none/upcoming/overdue and suppresses done", () => {
  const now = 1000 * DAY;
  assert.equal(dueState(makeItem({ text: "x" }, { id: "a", now }), now), "none");
  assert.equal(dueState(makeItem({ text: "x", due: now + DAY }, { id: "a", now }), now), "upcoming");
  assert.equal(dueState(makeItem({ text: "x", due: now - DAY }, { id: "a", now }), now), "overdue");
  const done = { ...makeItem({ text: "x", due: now - DAY }, { id: "a", now }), done: true };
  assert.equal(dueState(done, now), "none");
});

test("sweepDue fires items whose reminder is in (lastCheck, now], ignoring done/out-of-window", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [
    makeItem({ text: "fire", due: 100 }, { id: "fire", now: 1 }),
    makeItem({ text: "future", due: 10000 }, { id: "future", now: 1 }),
    { ...makeItem({ text: "done", due: 100 }, { id: "done", now: 1 }), done: true },
  ];
  b.lists = [l];
  const { due, bucket } = sweepDue(b, 50, 200);
  assert.deepEqual(due.map((i) => i.id), ["fire"]);
  assert.equal(bucket, b); // nothing recurring → same reference
});

test("sweepDue rolls a recurring fired item forward without mutating input", () => {
  const now = 1000 * DAY;
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [makeItem({ text: "r", due: now - 10, repeat: "daily" }, { id: "r", now: 1 })];
  b.lists = [l];
  const snap = JSON.parse(JSON.stringify(b));
  const { due, bucket } = sweepDue(b, now - 1000, now);
  assert.deepEqual(due.map((i) => i.id), ["r"]);
  assert.notEqual(bucket, b);
  assert.equal(bucket.lists[0].items[0].due, nextOccurrence(now - 10, "daily", now));
  assert.deepEqual(b, snap); // input untouched
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-due.test.js`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Append the helpers to `src/lib/model.js`**

```js
export function reminderTime(item) {
  if (item.due == null) return null;
  return item.due - (item.remindLead || 0) * 60000;
}

export function nextOccurrence(due, repeat, now) {
  const step = repeat === "weekly" ? 7 * 86400000 : 86400000;
  let next = due;
  while (next <= now) next += step;
  return next;
}

export function dueState(item, now) {
  if (item.due == null || item.done) return "none";
  return item.due <= now ? "overdue" : "upcoming";
}

export function sweepDue(bucket, lastCheck, now) {
  const due = [];
  let bucketChanged = false;
  const lists = bucket.lists.map((list) => {
    let listChanged = false;
    const items = list.items.map((item) => {
      if (item.done || item.due == null) return item;
      const rt = reminderTime(item);
      if (rt > lastCheck && rt <= now) {
        due.push(item);
        if (item.repeat) {
          listChanged = true;
          bucketChanged = true;
          return { ...item, due: nextOccurrence(item.due, item.repeat, now) };
        }
      }
      return item;
    });
    return listChanged ? { ...list, items } : list;
  });
  return { due, bucket: bucketChanged ? { ...bucket, lists } : bucket };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model-due.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.js test/model-due.test.js
git commit -m "feat: add reminder/recurrence scheduling helpers (sweepDue et al.)"
```

---

### Task 3: Manifest + background — alarm, sweep, notifications

**Files:**
- Modify: `manifest.json` (permissions)
- Modify: `src/background.js`

**Interfaces:**
- Consumes: `sweepDue`, `isHttpUrl` (model.js); `getAllDomains`, `setDomain`, `getMeta`, `setMeta` (storage.js); existing `resolveScope`, `countOpenItems`, `addToInbox`, `makeDomainBucket`, `getDomain`.
- Produces: reminder firing behavior. No exports.

Read the current `manifest.json` and `src/background.js` first.

- [ ] **Step 1: Add permissions** — in `manifest.json`, change `permissions` to:

```json
  "permissions": ["storage", "unlimitedStorage", "tabs", "contextMenus", "notifications", "alarms"],
```

- [ ] **Step 2: Update background imports** — adjust the model and storage imports in `src/background.js` to add `sweepDue`, `isHttpUrl`, `getAllDomains`, `getMeta`, `setMeta`:

```js
import { resolveScope } from "./lib/scope.js";
import { countOpenItems, addToInbox, makeDomainBucket, sweepDue, isHttpUrl } from "./lib/model.js";
import { getDomain, setDomain, getAllDomains, getMeta, setMeta } from "./lib/storage.js";
```

- [ ] **Step 3: Create the alarm on install and startup** — inside the existing `chrome.runtime.onInstalled` listener (which already sets the badge color and creates context menus), add this line (e.g. right after the `setBadgeBackgroundColor` call):

```js
  chrome.alarms.create("due-check", { periodInMinutes: 1 });
```

Then add a startup listener (so the alarm is re-ensured when the browser restarts) — append near the other top-level listeners:

```js
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("due-check", { periodInMinutes: 1 });
});
```

- [ ] **Step 4: Add the sweep + notification handlers** — append to `src/background.js`:

```js
function notifyDue(item, domain) {
  const id = isHttpUrl(item.url) ? item.url : "webnotes:app:" + item.id;
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: (item.text || "Reminder").slice(0, 80),
    message: domain,
  });
}

async function runDueSweep() {
  const meta = await getMeta();
  meta.settings = meta.settings ?? {};
  const now = Date.now();
  const lastCheck = meta.settings.lastDueCheck;
  if (lastCheck == null) {
    meta.settings.lastDueCheck = now;
    await setMeta(meta);
    return;
  }
  const domains = await getAllDomains();
  for (const [key, bucket] of Object.entries(domains)) {
    const { due, bucket: next } = sweepDue(bucket, lastCheck, now);
    for (const item of due) notifyDue(item, bucket.domain);
    if (next !== bucket) await setDomain(key, next);
  }
  meta.settings.lastDueCheck = now;
  await setMeta(meta);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "due-check") await runDueSweep();
});

chrome.notifications.onClicked.addListener((id) => {
  const url = id.startsWith("http") ? id : chrome.runtime.getURL("src/app/app.html");
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});
```

- [ ] **Step 5: Static checks**

Run: `node --check src/background.js`
Expected: exits 0.
Run: `node -e "const j=JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log(['notifications','alarms'].every(p=>j.permissions.includes(p)))"`
Expected: prints `true`.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 6: Commit**

```bash
git add manifest.json src/background.js
git commit -m "feat: add due-check alarm, reminder sweep, and notifications"
```

> In-browser verification (set a due ~1–2 min out → notification fires; click opens link/app; recurring rolls forward) is deferred to the end-of-milestone manual pass.

---

### Task 4: Popup — due/remind/repeat fields + due indicator

**Files:**
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`

**Interfaces:**
- Consumes: `dueState` (model.js, add to import); existing `el`, `save`, `detailsPanel`, `itemRow`.
- Produces: popup due UI.

Read `src/popup/popup.js` first.

- [ ] **Step 1: Add `dueState` to the model import** — in `src/popup/popup.js`, add `dueState` to the existing `from "../lib/model.js"` import.

- [ ] **Step 2: Add date/format helpers** — add these near the other top-level helpers (e.g. after the `el` function):

```js
function toLocalInput(ms) {
  if (ms == null) return "";
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(value) {
  return value ? new Date(value).getTime() : null;
}
function formatDue(ms, now) {
  const diff = ms - now, abs = Math.abs(diff), m = 60000, h = 3600000, d = 86400000;
  const s = abs < h ? Math.max(1, Math.round(abs / m)) + "m" : abs < d ? Math.round(abs / h) + "h" : Math.round(abs / d) + "d";
  return diff < 0 ? "overdue " + s : "in " + s;
}
```

- [ ] **Step 3: Add the due/remind/repeat rows to `detailsPanel`** — in `detailsPanel(item)`, replace the final `panel.append(linkRow, noteRow);` with the following (defines three new rows, then appends all five):

```js
  const dueInput = el("input", { type: "datetime-local", className: "due-input", value: toLocalInput(item.due) });
  dueInput.onchange = async () => { item.due = fromLocalInput(dueInput.value); item.updatedAt = Date.now(); await save(); };
  const clearDue = el("button", { className: "del", textContent: "✕", title: "Clear due date" });
  clearDue.onclick = async () => { item.due = null; item.updatedAt = Date.now(); await save(); };
  const dueRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Due" }), dueInput, clearDue]);

  const remind = el("select", { className: "remind-input" });
  for (const [label, mins] of [["At time", 0], ["5 min before", 5], ["30 min before", 30], ["1 hour before", 60], ["1 day before", 1440]]) {
    const o = el("option", { value: String(mins), textContent: label });
    if ((item.remindLead || 0) === mins) o.selected = true;
    remind.append(o);
  }
  remind.onchange = async () => { item.remindLead = Number(remind.value); item.updatedAt = Date.now(); await save(); };
  const remindRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Remind" }), remind]);

  const repeat = el("select", { className: "repeat-input" });
  for (const [label, val] of [["No repeat", ""], ["Daily", "daily"], ["Weekly", "weekly"]]) {
    const o = el("option", { value: val, textContent: label });
    if ((item.repeat || "") === val) o.selected = true;
    repeat.append(o);
  }
  repeat.onchange = async () => { item.repeat = repeat.value || null; item.updatedAt = Date.now(); await save(); };
  const repeatRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Repeat" }), repeat]);

  panel.append(linkRow, noteRow, dueRow, remindRow, repeatRow);
```

- [ ] **Step 4: Add the due indicator to `itemRow`** — in `itemRow`, right after the line that appends the 📝 note indicator (`if (item.note) row.append(...)`), add:

```js
  if (item.due != null) {
    const flag = el("span", { className: "due-flag" + (dueState(item, Date.now()) === "overdue" ? " overdue" : ""), textContent: "📅 " + formatDue(item.due, Date.now()) });
    flag.title = new Date(item.due).toLocaleString();
    row.append(flag);
  }
```

- [ ] **Step 5: Add CSS** — append to `src/popup/popup.css`:

```css
.due-flag { font-size: 11px; color: var(--muted); }
.due-flag.overdue { color: #dc2626; font-weight: 600; }
.due-input, .remind-input, .repeat-input { padding: 3px 5px; border: 1px solid var(--line); border-radius: 4px; font: inherit; }
```

- [ ] **Step 6: Static checks**

Run: `node --check src/popup/popup.js`
Expected: exits 0.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 7: Commit**

```bash
git add src/popup/popup.js src/popup/popup.css
git commit -m "feat: add due/remind/repeat fields and due indicator to popup"
```

---

### Task 5: Full-page app — due/remind/repeat fields + due indicator

**Files:**
- Modify: `src/app/app.js`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `dueState` (model.js, add to import); existing `el`, `setDomain`, `detailsPanel(key,item)`, `renderItem`.
- Produces: full-app due UI.

Read `src/app/app.js` first.

- [ ] **Step 1: Add `dueState` to the model import** — in `src/app/app.js`, add `dueState` to the existing `from "../lib/model.js"` import.

- [ ] **Step 2: Add date/format helpers** — add near the `el` helper:

```js
function toLocalInput(ms) {
  if (ms == null) return "";
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(value) {
  return value ? new Date(value).getTime() : null;
}
function formatDue(ms, now) {
  const diff = ms - now, abs = Math.abs(diff), m = 60000, h = 3600000, d = 86400000;
  const s = abs < h ? Math.max(1, Math.round(abs / m)) + "m" : abs < d ? Math.round(abs / h) + "h" : Math.round(abs / d) + "d";
  return diff < 0 ? "overdue " + s : "in " + s;
}
```

- [ ] **Step 3: Add the due/remind/repeat rows to `detailsPanel`** — in `detailsPanel(key, item)` (note it has `const b = state.domains[key];` and persists via `setDomain(key, b)`), replace the final `panel.append(linkRow, noteRow);` with:

```js
  const dueInput = el("input", { type: "datetime-local", className: "due-input", value: toLocalInput(item.due) });
  dueInput.onchange = async () => { item.due = fromLocalInput(dueInput.value); item.updatedAt = Date.now(); await setDomain(key, b); };
  const clearDue = el("button", { className: "btn", textContent: "✕", title: "Clear due date" });
  clearDue.onclick = async () => { item.due = null; item.updatedAt = Date.now(); await setDomain(key, b); };
  const dueRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Due" }), dueInput, clearDue]);

  const remind = el("select", { className: "remind-input" });
  for (const [label, mins] of [["At time", 0], ["5 min before", 5], ["30 min before", 30], ["1 hour before", 60], ["1 day before", 1440]]) {
    const o = el("option", { value: String(mins), textContent: label });
    if ((item.remindLead || 0) === mins) o.selected = true;
    remind.append(o);
  }
  remind.onchange = async () => { item.remindLead = Number(remind.value); item.updatedAt = Date.now(); await setDomain(key, b); };
  const remindRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Remind" }), remind]);

  const repeat = el("select", { className: "repeat-input" });
  for (const [label, val] of [["No repeat", ""], ["Daily", "daily"], ["Weekly", "weekly"]]) {
    const o = el("option", { value: val, textContent: label });
    if ((item.repeat || "") === val) o.selected = true;
    repeat.append(o);
  }
  repeat.onchange = async () => { item.repeat = repeat.value || null; item.updatedAt = Date.now(); await setDomain(key, b); };
  const repeatRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Repeat" }), repeat]);

  panel.append(linkRow, noteRow, dueRow, remindRow, repeatRow);
```

- [ ] **Step 4: Add the due indicator to `renderItem`** — in `renderItem`, right after the line that appends the 📝 note indicator (`if (item.note) row.append(...)`), add:

```js
  if (item.due != null) {
    const flag = el("span", { className: "due-flag" + (dueState(item, Date.now()) === "overdue" ? " overdue" : ""), textContent: "📅 " + formatDue(item.due, Date.now()) });
    flag.title = new Date(item.due).toLocaleString();
    row.append(flag);
  }
```

- [ ] **Step 5: Add CSS** — append to `src/app/app.css`:

```css
.due-flag { font-size: 12px; color: var(--muted); }
.due-flag.overdue { color: #dc2626; font-weight: 600; }
.due-input, .remind-input, .repeat-input { padding: 4px 6px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
```

- [ ] **Step 6: Static checks**

Run: `node --check src/app/app.js`
Expected: exits 0.
Run: `grep -c "function detailsPanel" src/app/app.js`
Expected: `1`.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 7: Commit**

```bash
git add src/app/app.js src/app/app.css
git commit -m "feat: add due/remind/repeat fields and due indicator to full-page app"
```

---

## Self-Review

**Spec coverage:**
- `due`/`remindLead`/`repeat` fields + validation (accept old backups) → Task 1. ✓
- `reminderTime`/`nextOccurrence`/`dueState`/`sweepDue` (pure, tested, non-mutating, same-ref when unchanged) → Task 2. ✓
- `notifications`/`alarms` permissions → Task 3 Step 1. ✓
- 1-min `due-check` alarm on install + startup → Task 3 Steps 3. ✓
- Sweep: first-run no retroactive fire; per-domain sweep; notify fired; persist rolled-forward recurring; advance `lastDueCheck` → Task 3 Step 4. ✓
- Notification with stateless id; click opens link or app → Task 3 Step 4. ✓
- Due/Remind/Repeat in the details panel + 📅/overdue indicator, popup and app → Tasks 4, 5. ✓
- Lead presets (at/5/30/60/1440), repeat (none/daily/weekly) → Tasks 4, 5. ✓
- Badge unchanged; widget/storage/scope untouched → confirmed (no such edits). ✓

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `sweepDue(bucket, lastCheck, now)` defined in Task 2, consumed in Task 3 with matching args and `{ due, bucket }` destructure. `dueState(item, now)` defined Task 2, used in Tasks 4/5. `reminderTime`/`nextOccurrence` used inside `sweepDue`. Notification id form (`"webnotes:app:"+id`) matches the click handler's `startsWith("http")` test. `toLocalInput`/`fromLocalInput`/`formatDue` are defined per UI file (consistent with the existing per-file `el` duplication). Field names `due`/`remindLead`/`repeat` consistent across all tasks.

**Note:** `remindLead` is stored as `Number(select.value)` (0 for "at time"); `reminderTime` treats `null`/`0` identically via `|| 0`. `validateBucket` uses `== null` for the new fields so older backups (missing them) still import.
