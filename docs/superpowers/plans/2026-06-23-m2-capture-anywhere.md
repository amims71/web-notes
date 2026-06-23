# Milestone 2 — Capture From Anywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context-menu capture (selection / page / link) and two keyboard shortcuts (open popup, save page), landing captures in a per-domain "Inbox" list as domain-level items.

**Architecture:** A pure, unit-tested `addToInbox` helper in `model.js` does the data work; the background service worker wires Chrome `contextMenus` and `commands` events to it. Popup, full-page app, and widget are untouched.

**Tech Stack:** Vanilla ES modules, no build step. Node's built-in test runner for the helper. Chrome MV3 `contextMenus` + `commands`.

## Global Constraints

- **No build step**; load unpacked. **No new dependencies.**
- **`model.js` stays PURE** (no `chrome`); the new helper is **non-mutating** (returns a new bucket), matching `moveItem`/`mergeStores`.
- **New permission:** `contextMenus` only. `commands` is a manifest key (no permission prompt). No other permission added.
- **Captures are domain-level**: `pageUrl = null`. The captured item's `url` is the source page (selection/page) or the link href (link) — always `http(s)`.
- **Target list** is the per-domain list named exactly `"Inbox"` (constant `INBOX_NAME`), auto-created if absent.
- **Suggested shortcuts:** `_execute_action` = `Alt+Shift+N` (opens popup, no handler), `save-page` = `Alt+Shift+S`.
- **No notification/toast feedback** this milestone (badge increment only).
- **Untouched:** popup, full-page app, floating widget.
- **Code comments:** only what isn't obvious; match density; no narration.
- **Commit** after each task's tests/checks pass. Small commits.

---

### Task 1: `model.js` — `INBOX_NAME` + `addToInbox` (pure, TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-inbox.test.js`

**Interfaces:**
- Consumes: existing `makeList`, `makeItem`, `nextOrder`.
- Produces:
  - `INBOX_NAME = "Inbox"` (exported constant).
  - `addToInbox(bucket, fields, opts = {}): bucket` — returns a NEW bucket. Finds the list named `INBOX_NAME`; if absent, creates one with `order = nextOrder(bucket.lists)`. Appends `makeItem({ ...fields, order: nextOrder(inbox.items) }, opts)` to it. `opts` (`{ id, now }`) is forwarded to `makeItem` only (not to the created list). Non-mutating.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDomainBucket, makeList, makeItem, addToInbox, INBOX_NAME } from "../src/lib/model.js";

test("addToInbox creates the Inbox list when absent and appends the item", () => {
  const b = makeDomainBucket("a.com");
  const out = addToInbox(b, { text: "grabbed", url: "https://a.com/x" }, { id: "i1", now: 5 });
  const inbox = out.lists.find((l) => l.name === INBOX_NAME);
  assert.ok(inbox, "inbox created");
  assert.equal(inbox.items.length, 1);
  assert.equal(inbox.items[0].id, "i1");
  assert.equal(inbox.items[0].text, "grabbed");
  assert.equal(inbox.items[0].url, "https://a.com/x");
  assert.equal(inbox.items[0].pageUrl, null);
  assert.equal(inbox.items[0].order, 0);
});

test("addToInbox appends to an existing Inbox and assigns order via nextOrder", () => {
  const b = makeDomainBucket("a.com");
  const inbox = makeList(INBOX_NAME, { id: "inbox" });
  inbox.items = [{ ...makeItem({ text: "old" }, { id: "old", now: 1 }), order: 0 }];
  b.lists = [inbox];
  const out = addToInbox(b, { text: "new" }, { id: "i2", now: 6 });
  const outInbox = out.lists.find((l) => l.id === "inbox");
  assert.deepEqual(outInbox.items.map((i) => i.id), ["old", "i2"]);
  assert.equal(outInbox.items[1].order, 1);
});

test("addToInbox does not create a second Inbox and keeps other lists", () => {
  const b = makeDomainBucket("a.com");
  b.lists = [makeList("Bugs", { id: "bugs" }), makeList(INBOX_NAME, { id: "inbox" })];
  const out = addToInbox(b, { text: "x" }, { id: "i3", now: 7 });
  assert.equal(out.lists.filter((l) => l.name === INBOX_NAME).length, 1);
  assert.equal(out.lists.length, 2);
});

test("addToInbox is non-mutating", () => {
  const b = makeDomainBucket("a.com");
  b.lists = [makeList(INBOX_NAME, { id: "inbox" })];
  const snap = JSON.parse(JSON.stringify(b));
  addToInbox(b, { text: "x" }, { id: "i4", now: 8 });
  assert.deepEqual(b, snap);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-inbox.test.js`
Expected: FAIL — `addToInbox` / `INBOX_NAME` not exported.

- [ ] **Step 3: Append to `src/lib/model.js`**

```js
export const INBOX_NAME = "Inbox";

export function addToInbox(bucket, fields, opts = {}) {
  const lists = [...bucket.lists];
  let inbox = lists.find((l) => l.name === INBOX_NAME);
  if (!inbox) {
    inbox = makeList(INBOX_NAME);
    inbox.order = nextOrder(lists);
    lists.push(inbox);
  }
  const item = makeItem({ ...fields, order: nextOrder(inbox.items) }, opts);
  return { ...bucket, lists: lists.map((l) => (l === inbox ? { ...l, items: [...l.items, item] } : l)) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model-inbox.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS (previous tests + the new file).

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.js test/model-inbox.test.js
git commit -m "feat: add addToInbox helper and INBOX_NAME constant"
```

---

### Task 2: Manifest + background — context menus & commands

**Files:**
- Modify: `manifest.json` (permission + commands)
- Modify: `src/background.js` (menus on install, onClicked, onCommand)

**Interfaces:**
- Consumes: `resolveScope` (scope.js); `addToInbox`, `makeDomainBucket` (model.js); `getDomain`, `setDomain` (storage.js).
- Produces: context-menu + shortcut capture behavior. No exports.

Read the current `manifest.json` and `src/background.js` first.

- [ ] **Step 1: Add the `contextMenus` permission** — in `manifest.json`, change the `permissions` array to:

```json
  "permissions": ["storage", "unlimitedStorage", "tabs", "contextMenus"],
```

- [ ] **Step 2: Add the `commands` block** — in `manifest.json`, add this top-level key (e.g. after the `"background"` block; ensure valid JSON commas):

```json
  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Alt+Shift+N" },
      "description": "Open Web Notes"
    },
    "save-page": {
      "suggested_key": { "default": "Alt+Shift+S" },
      "description": "Save the current page to Web Notes"
    }
  },
```

- [ ] **Step 3: Update background imports** — in `src/background.js`, change the import lines to add `addToInbox`, `makeDomainBucket`, and `setDomain`:

```js
import { resolveScope } from "./lib/scope.js";
import { countOpenItems, addToInbox, makeDomainBucket } from "./lib/model.js";
import { getDomain, setDomain } from "./lib/storage.js";
```

- [ ] **Step 4: Create the context menus on install** — replace the existing `chrome.runtime.onInstalled.addListener(...)` block with:

```js
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
  const web = ["http://*/*", "https://*/*"];
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "capture-selection", title: "Add selection to Web Notes", contexts: ["selection"], documentUrlPatterns: web });
    chrome.contextMenus.create({ id: "capture-page", title: "Add this page to Web Notes", contexts: ["page"], documentUrlPatterns: web });
    chrome.contextMenus.create({ id: "capture-link", title: "Add link to Web Notes", contexts: ["link"], documentUrlPatterns: web });
  });
});
```

- [ ] **Step 5: Add the capture helper + handlers** — append to `src/background.js`:

```js
async function captureToDomain(pageUrl, fields) {
  const scope = resolveScope(pageUrl);
  if (scope.kind !== "web" || !fields.text) return;
  const bucket = (await getDomain(scope.key)) ?? makeDomainBucket(scope.domain);
  await setDomain(scope.key, addToInbox(bucket, fields));
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const pageUrl = info.pageUrl ?? tab?.url;
  if (!pageUrl) return;
  let fields = null;
  if (info.menuItemId === "capture-selection" && info.selectionText) fields = { text: info.selectionText.trim(), url: pageUrl };
  else if (info.menuItemId === "capture-page") fields = { text: tab?.title || pageUrl, url: pageUrl };
  else if (info.menuItemId === "capture-link" && info.linkUrl) fields = { text: info.linkUrl, url: info.linkUrl };
  if (fields) await captureToDomain(pageUrl, fields);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  await captureToDomain(tab.url, { text: tab.title || tab.url, url: tab.url });
});
```

- [ ] **Step 6: Static checks**

Run: `node --check src/background.js`
Expected: exits 0.
Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest OK')"`
Expected: prints `manifest OK`.
Run: `node -e "const m=require('fs').readFileSync('manifest.json','utf8'); const j=JSON.parse(m); console.log(j.permissions.includes('contextMenus'), !!j.commands['_execute_action'], !!j.commands['save-page'])"`
Expected: prints `true true true`.
Run: `npm test`
Expected: unchanged pass count (background.js/manifest aren't imported by tests).

- [ ] **Step 7: Commit**

```bash
git add manifest.json src/background.js
git commit -m "feat: add context-menu capture and keyboard-shortcut commands"
```

> In-browser verification (right-click selection/page/link → item lands in that domain's Inbox with correct text/link and the badge bumps; `Alt+Shift+S` saves the page; `Alt+Shift+N` opens the popup; menus absent on `chrome://` pages) is deferred to the end-of-milestone manual pass.

---

## Self-Review

**Spec coverage:**
- Three captures (selection/page/link) → Task 2 onClicked. ✓
- Inbox target list (auto-created) → Task 1 `addToInbox`. ✓
- Domain-level captures (`pageUrl = null`) → Task 1 (`makeItem` defaults `pageUrl` to null; no pin set). ✓
- Captured field shapes (selection: page url; page: title+url; link: href+href) → Task 2 onClicked. ✓
- Capture to the current page's domain bucket → Task 2 `captureToDomain` via `resolveScope(pageUrl)`. ✓
- `_execute_action` (open popup) + `save-page` shortcut → Task 2 Steps 2, 5. ✓
- `contextMenus` permission; `commands` key → Task 2 Steps 1, 2. ✓
- Badge feedback only → no notification code added; existing badge listeners react to the storage write. ✓
- Non-web pages excluded → `documentUrlPatterns` + `captureToDomain` scope guard. ✓
- Empty selection skipped → `captureToDomain` `!fields.text` guard + onClicked `info.selectionText` check. ✓
- Pure non-mutating helper, tested → Task 1. ✓
- Untouched popup/app/widget → no such files in any task. ✓

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `addToInbox(bucket, fields, opts)` defined in Task 1 and called as `addToInbox(bucket, fields)` in Task 2 (opts defaults to `{}` — correct for runtime; tests pass opts). `captureToDomain(pageUrl, fields)` is internal to background. `fields` is consistently `{ text, url }`. `resolveScope(...).key/domain/kind` match existing usage. `makeDomainBucket`, `getDomain`, `setDomain` signatures match storage/model.

**Note:** `addToInbox`'s create-Inbox path calls `makeList(INBOX_NAME)` → `newId()` → `crypto.randomUUID()`; the first unit test exercises this, so the test host needs Node ≥ 20 (global Web Crypto), which the project already assumes (the extension runtime and prior tests rely on it).
