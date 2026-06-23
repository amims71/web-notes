# Milestone 1 — Capture & Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose per-item link & notes editing (inline details panel), add a popup "save this page" quick action, and enable cross-list item moves + list reordering in the full-page app — all over the existing data model.

**Architecture:** No data-model change (`item.url`/`item.note` already exist). Pure, tested move/reorder helpers go in `src/lib/model.js`; the popup and full-page app gain an inline details panel and the reordering wiring on top of them. Every edit bumps `item.updatedAt` so existing cross-surface sync and import-merge keep working.

**Tech Stack:** Vanilla ES modules, no build step. Node's built-in test runner for the pure helpers.

## Global Constraints

- **No build step**; load unpacked. `package.json` is test-only.
- **No new dependencies**; `src/lib/` and tests use only built-ins.
- **No data-model change**: reuse `item.url` and `item.note`. Storage keys stay `meta` + `d:<domain>`.
- **No new permissions**; `manifest.json` is untouched this milestone.
- **Pure modules** (`scope.js`, `model.js`) reference no `chrome`. New helpers in `model.js` must be **non-mutating** (return new objects), matching `mergeStores`.
- **Only `http(s)` URLs render as clickable links** — reuse the existing `isHttpUrl(u)` from `model.js`.
- **Floating widget is untouched** this milestone.
- **Cross-domain item moves are out of scope**: moves are allowed only within the same domain bucket (`src.key === key`).
- **Code comments:** comment only what isn't obvious; match surrounding density; no narration.
- **Commit** after each task's tests pass (or after static checks for the UI tasks). Keep commits small.

---

### Task 1: `model.js` — `moveItem` and `reorderLists` (pure, TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-move.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `moveItem(bucket, fromListId, toListId, itemId, toIndex): bucket` — returns a NEW bucket with the item removed from `fromListId` and inserted into `toListId` at `toIndex` (clamped to `[0, len]`); `order` reassigned `0..n-1` in every affected list. `fromListId === toListId` performs an in-list reorder. Returns the bucket unchanged if any id is missing. Non-mutating.
  - `reorderLists(bucket, orderedListIds): bucket` — returns a NEW bucket whose lists are ordered to match `orderedListIds` (ids not listed keep their relative order at the end); `order` reassigned `0..n-1`. Non-mutating.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, moveItem, reorderLists } from "../src/lib/model.js";

function bucketWithTwoLists() {
  const b = makeDomainBucket("a.com");
  const l1 = makeList("L1", { id: "l1" });
  l1.items = [
    { ...makeItem({ text: "a" }, { id: "a", now: 1 }), order: 0 },
    { ...makeItem({ text: "b" }, { id: "b", now: 1 }), order: 1 },
    { ...makeItem({ text: "c" }, { id: "c", now: 1 }), order: 2 },
  ];
  const l2 = makeList("L2", { id: "l2" });
  l2.items = [{ ...makeItem({ text: "d" }, { id: "d", now: 1 }), order: 0 }];
  b.lists = [l1, l2];
  return b;
}

test("moveItem reorders within a list and reassigns order", () => {
  const b = bucketWithTwoLists();
  const out = moveItem(b, "l1", "l1", "c", 0);
  const ids = out.lists[0].items.map((i) => i.id);
  assert.deepEqual(ids, ["c", "a", "b"]);
  assert.deepEqual(out.lists[0].items.map((i) => i.order), [0, 1, 2]);
});

test("moveItem moves an item to another list at an index", () => {
  const b = bucketWithTwoLists();
  const out = moveItem(b, "l1", "l2", "b", 0);
  assert.deepEqual(out.lists[0].items.map((i) => i.id), ["a", "c"]);
  assert.deepEqual(out.lists[1].items.map((i) => i.id), ["b", "d"]);
  assert.deepEqual(out.lists[0].items.map((i) => i.order), [0, 1]);
  assert.deepEqual(out.lists[1].items.map((i) => i.order), [0, 1]);
});

test("moveItem clamps a large toIndex to append", () => {
  const b = bucketWithTwoLists();
  const out = moveItem(b, "l1", "l2", "a", 99);
  assert.deepEqual(out.lists[1].items.map((i) => i.id), ["d", "a"]);
});

test("moveItem is a no-op on missing ids and does not mutate input", () => {
  const b = bucketWithTwoLists();
  const snap = JSON.parse(JSON.stringify(b));
  assert.equal(moveItem(b, "nope", "l2", "a", 0), b);
  assert.equal(moveItem(b, "l1", "l2", "nope", 0), b);
  moveItem(b, "l1", "l2", "b", 0);
  assert.deepEqual(b, snap);
});

test("reorderLists reorders and reassigns order, leftovers kept at end", () => {
  const b = bucketWithTwoLists();
  const out = reorderLists(b, ["l2", "l1"]);
  assert.deepEqual(out.lists.map((l) => l.id), ["l2", "l1"]);
  assert.deepEqual(out.lists.map((l) => l.order), [0, 1]);
  const out2 = reorderLists(b, ["l2"]); // l1 not listed -> kept at end
  assert.deepEqual(out2.lists.map((l) => l.id), ["l2", "l1"]);
});

test("reorderLists does not mutate input", () => {
  const b = bucketWithTwoLists();
  const snap = JSON.parse(JSON.stringify(b));
  reorderLists(b, ["l2", "l1"]);
  assert.deepEqual(b, snap);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-move.test.js`
Expected: FAIL — `moveItem` / `reorderLists` are not exported.

- [ ] **Step 3: Append the helpers to `src/lib/model.js`**

```js
export function moveItem(bucket, fromListId, toListId, itemId, toIndex) {
  const from = bucket.lists.find((l) => l.id === fromListId);
  const to = bucket.lists.find((l) => l.id === toListId);
  if (!from || !to) return bucket;
  const item = from.items.find((i) => i.id === itemId);
  if (!item) return bucket;
  const reindex = (items) => items.map((it, i) => ({ ...it, order: i }));
  const clamp = (n, len) => Math.max(0, Math.min(n, len));
  const lists = bucket.lists.map((l) => {
    if (fromListId === toListId && l.id === fromListId) {
      const items = l.items.filter((i) => i.id !== itemId);
      items.splice(clamp(toIndex, items.length), 0, item);
      return { ...l, items: reindex(items) };
    }
    if (l.id === fromListId) return { ...l, items: reindex(l.items.filter((i) => i.id !== itemId)) };
    if (l.id === toListId) {
      const items = [...l.items];
      items.splice(clamp(toIndex, items.length), 0, item);
      return { ...l, items: reindex(items) };
    }
    return l;
  });
  return { ...bucket, lists };
}

export function reorderLists(bucket, orderedListIds) {
  const byId = new Map(bucket.lists.map((l) => [l.id, l]));
  const ordered = [];
  for (const id of orderedListIds) {
    const l = byId.get(id);
    if (l) { ordered.push(l); byId.delete(id); }
  }
  for (const l of byId.values()) ordered.push(l);
  return { ...bucket, lists: ordered.map((l, i) => ({ ...l, order: i })) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model-move.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS (previous tests + the new file).

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.js test/model-move.test.js
git commit -m "feat: add non-mutating moveItem and reorderLists helpers"
```

---

### Task 2: Popup — details panel, indicators, "save this page"

**Files:**
- Modify: `src/popup/popup.html` (footer button)
- Modify: `src/popup/popup.js` (item row + details panel + save-page)
- Modify: `src/popup/popup.css` (panel styles)

**Interfaces:**
- Consumes: existing `resolveScope`, `makeList`, `makeItem`, `nextOrder`, `isHttpUrl` (model.js); `getDomain`, `setDomain`, `subscribe` (storage.js); existing `scope`, `bucket`, `save`, `el`, `editItem`, `render` in popup.js.
- Produces: popup UI only.

Read `src/popup/popup.js` first; apply the edits below.

- [ ] **Step 1: Add module state** — after the line `let bucket = null;` add:

```js
const expanded = new Set();
let pendingEditId = null;
```

- [ ] **Step 2: Add the details-panel builder** — add this function above `itemRow`:

```js
function detailsPanel(item) {
  const panel = el("div", { className: "details" });
  panel.hidden = !expanded.has(item.id);

  const link = el("input", { type: "text", className: "link-input", value: item.url ?? "", placeholder: "https://…" });
  link.oninput = () => { item.url = link.value.trim() || null; };
  link.onchange = async () => { item.url = link.value.trim() || null; item.updatedAt = Date.now(); await save(); };
  const use = el("button", { className: "link small", textContent: "Use this page", title: "Use the current page URL" });
  use.onclick = async () => { item.url = scope.pageUrl; item.updatedAt = Date.now(); await save(); };
  const clearLink = el("button", { className: "del", textContent: "✕", title: "Clear link" });
  clearLink.onclick = async () => { item.url = null; item.updatedAt = Date.now(); await save(); };
  const linkRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Link" }), link, use, clearLink]);

  const note = el("textarea", { className: "note-input", value: item.note ?? "", placeholder: "Notes…", rows: 2 });
  note.oninput = () => { item.note = note.value.trim() || null; };
  note.onchange = async () => { item.note = note.value.trim() || null; item.updatedAt = Date.now(); await save(); };
  const noteRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Notes" }), note]);

  panel.append(linkRow, noteRow);
  return panel;
}
```

- [ ] **Step 3: Replace `itemRow`** with this version (adds 🔗/📝 indicators, ▸ disclosure, details panel, pending-edit focus):

```js
function itemRow(list, item) {
  const cb = el("input", { type: "checkbox", checked: item.done });
  cb.onchange = async () => { item.done = cb.checked; item.updatedAt = Date.now(); await save(); };

  const text = el("span", { className: "text", textContent: item.text });
  text.title = "Double-click to edit";
  text.ondblclick = () => editItem(text, item);

  const row = el("div", { className: "item" + (item.done ? " done" : "") }, [cb, text]);
  if (isHttpUrl(item.url)) row.append(el("a", { href: item.url, target: "_blank", textContent: "🔗", title: item.url }));
  if (item.note) row.append(el("span", { className: "has-note", textContent: "📝", title: "Has notes" }));

  const panel = detailsPanel(item);
  const toggle = el("button", { className: "disclosure", textContent: expanded.has(item.id) ? "▾" : "▸", title: "Details" });
  toggle.onclick = () => {
    const open = !expanded.has(item.id);
    open ? expanded.add(item.id) : expanded.delete(item.id);
    panel.hidden = !open;
    toggle.textContent = open ? "▾" : "▸";
  };
  row.append(toggle);

  const del = el("button", { className: "del", textContent: "✕", title: "Delete" });
  del.onclick = async () => { list.items = list.items.filter((x) => x !== item); expanded.delete(item.id); await save(); };
  row.append(del);

  if (pendingEditId === item.id) { pendingEditId = null; requestAnimationFrame(() => editItem(text, item)); }
  return el("div", { className: "item-wrap" }, [row, panel]);
}
```

- [ ] **Step 4: Add the footer "save this page" button** — in `src/popup/popup.html`, replace the `<footer>…</footer>` block with:

```html
    <footer>
      <button id="save-page" class="link">+ save this page</button>
      <button id="new-list" class="link">+ new list</button>
      <label class="widget-toggle"><input type="checkbox" id="widget-toggle" /> widget</label>
    </footer>
```

- [ ] **Step 5: Wire the save-page handler** — in `src/popup/popup.js`, add near the other handlers (e.g. after the `$("new-list").onclick = …` assignment):

```js
$("save-page").onclick = async () => {
  if (scope?.kind !== "web") return;
  let list = [...bucket.lists].sort((a, b) => a.order - b.order)[0];
  if (!list) { list = makeList("Notes"); list.order = nextOrder(bucket.lists); bucket.lists.push(list); }
  const item = makeItem({ url: scope.pageUrl, order: nextOrder(list.items) });
  list.items.push(item);
  pendingEditId = item.id;
  await save();
};
```

- [ ] **Step 6: Hide save-page on non-web pages** — in `load()`, inside the existing `if (scope.kind !== "web") { … }` branch (which already hides `#new-list` and the widget toggle), add:

```js
    $("save-page").hidden = true;
```

- [ ] **Step 7: Add CSS** — append to `src/popup/popup.css`:

```css
.disclosure { background: none; border: none; cursor: pointer; color: var(--muted); padding: 0 2px; }
.has-note { font-size: 11px; }
.item-wrap { border-bottom: none; }
.details { padding: 4px 0 6px 22px; }
.detail-row { display: flex; align-items: flex-start; gap: 6px; margin: 3px 0; }
.detail-label { width: 36px; color: var(--muted); font-size: 11px; padding-top: 3px; }
.link-input { flex: 1; padding: 3px 5px; border: 1px solid var(--line); border-radius: 4px; font: inherit; }
.note-input { flex: 1; padding: 3px 5px; border: 1px solid var(--line); border-radius: 4px; font: inherit; resize: vertical; }
.link.small { font-size: 11px; white-space: nowrap; }
```

- [ ] **Step 8: Static checks**

Run: `node --check src/popup/popup.js`
Expected: exits 0.
Run: `npm test`
Expected: unchanged pass count (popup.js isn't imported by tests).

- [ ] **Step 9: Commit**

```bash
git add src/popup/popup.html src/popup/popup.js src/popup/popup.css
git commit -m "feat: add item details panel (link+notes), indicators, and save-this-page to popup"
```

> In-browser verification (open popup → expand an item → set link via "Use this page" → add a note → confirm 🔗/📝 appear and persist; click "save this page" → a url-bearing item is added and opens in edit mode) is deferred to the end-of-milestone manual pass.

---

### Task 3: Full-page app — details panel, cross-list move, list reorder

**Files:**
- Modify: `src/app/app.js` (item row + details panel + drag/drop; list-block drag/drop)
- Modify: `src/app/app.css` (panel + list-drag styles)

**Interfaces:**
- Consumes: `moveItem`, `reorderLists`, `isHttpUrl` (model.js, add to imports); existing `getAllDomains`, `setDomain`, `removeDomain`, `subscribe` (storage.js); existing `state`, `el`, `render`, `renderTree`, `reload`.
- Produces: full-page app UI only.

Read `src/app/app.js` first; apply the edits below.

- [ ] **Step 1: Update the model import** — change the model.js import line to:

```js
import { serializeStore, parseBackup, mergeStores, isHttpUrl, moveItem, reorderLists } from "../lib/model.js";
```

- [ ] **Step 2: Add module state** — after the `export const state = …` line add:

```js
const expanded = new Set();
```

- [ ] **Step 3: Add the details-panel builder** — add above `renderItem` (note: no "Use this page" — the app has no current page):

```js
function detailsPanel(key, item) {
  const b = state.domains[key];
  const panel = el("div", { className: "details" });
  panel.hidden = !expanded.has(item.id);

  const link = el("input", { type: "text", className: "link-input", value: item.url ?? "", placeholder: "https://…" });
  link.oninput = () => { item.url = link.value.trim() || null; };
  link.onchange = async () => { item.url = link.value.trim() || null; item.updatedAt = Date.now(); await setDomain(key, b); };
  const clearLink = el("button", { className: "btn", textContent: "✕", title: "Clear link" });
  clearLink.onclick = async () => { item.url = null; item.updatedAt = Date.now(); await setDomain(key, b); };
  const linkRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Link" }), link, clearLink]);

  const note = el("textarea", { className: "note-input", value: item.note ?? "", placeholder: "Notes…", rows: 2 });
  note.oninput = () => { item.note = note.value.trim() || null; };
  note.onchange = async () => { item.note = note.value.trim() || null; item.updatedAt = Date.now(); await setDomain(key, b); };
  const noteRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Notes" }), note]);

  panel.append(linkRow, noteRow);
  return panel;
}
```

- [ ] **Step 4: Replace `renderItem`** with this version (adds 📝 indicator, ▸ disclosure, details panel wrapper, and item drag/drop routed through `moveItem`):

```js
function renderItem(key, list, item) {
  const b = state.domains[key];
  const cb = el("input", { type: "checkbox", checked: item.done });
  cb.onchange = async () => { item.done = cb.checked; item.updatedAt = Date.now(); await setDomain(key, b); };

  const t = el("span", { className: "t", textContent: item.text });
  t.title = "Double-click to edit";
  t.ondblclick = () => {
    const input = el("input", { type: "text", value: item.text });
    input.onkeydown = (e) => { if (e.key === "Enter") input.blur(); };
    input.onblur = async () => { item.text = input.value.trim() || item.text; item.updatedAt = Date.now(); await setDomain(key, b); };
    t.replaceWith(input);
    input.focus();
  };

  const row = el("div", { className: "item" + (item.done ? " done" : ""), draggable: true }, [cb, t]);
  if (item.pageUrl) row.append(el("span", { className: "pin", textContent: "★ " + item.pageUrl }));
  if (isHttpUrl(item.url)) row.append(el("a", { href: item.url, target: "_blank", textContent: "🔗" }));
  if (item.note) row.append(el("span", { className: "has-note", textContent: "📝", title: "Has notes" }));

  const panel = detailsPanel(key, item);
  const toggle = el("button", { className: "btn", textContent: expanded.has(item.id) ? "▾" : "▸", title: "Details" });
  toggle.onclick = () => {
    const open = !expanded.has(item.id);
    open ? expanded.add(item.id) : expanded.delete(item.id);
    panel.hidden = !open;
    toggle.textContent = open ? "▾" : "▸";
  };
  row.append(toggle);

  const del = el("button", { className: "btn", textContent: "✕" });
  del.onclick = async () => { list.items = list.items.filter((x) => x !== item); expanded.delete(item.id); await setDomain(key, b); };
  row.append(del);

  row.ondragstart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "item", key, list: list.id, item: item.id }));
    row.classList.add("dragging");
  };
  row.ondragend = () => row.classList.remove("dragging");
  row.ondragover = (e) => { e.preventDefault(); row.classList.add("drag-over"); };
  row.ondragleave = () => row.classList.remove("drag-over");
  row.ondrop = async (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    const src = JSON.parse(e.dataTransfer.getData("text/plain"));
    if (src.type !== "item" || src.key !== key) return; // items only, same domain only
    e.stopPropagation();
    const destIndex = list.items.findIndex((x) => x.id === item.id);
    await setDomain(key, moveItem(b, src.list, list.id, src.item, destIndex));
  };

  return el("div", { className: "item-wrap" }, [row, panel]);
}
```

- [ ] **Step 5: Make list-blocks draggable + droppable** — in `renderTree`, the list-block is built as `const lb = el("div", { className: "list-block", dataset: { key, list: list.id } }, [ el("h3", …) ])`. Replace that list-block construction (the `const lb = …` line and the loop body that appends items) with:

```js
      const done = list.items.filter((i) => i.done).length;
      const header = el("h3", { draggable: true }, [
        el("span", { textContent: list.name }),
        el("span", { className: "count", textContent: `${done}/${list.items.length}` }),
      ]);
      const lb = el("div", { className: "list-block", dataset: { key, list: list.id } }, [header]);
      header.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "list", key, list: list.id }));
        lb.classList.add("dragging");
      };
      header.ondragend = () => lb.classList.remove("dragging");
      lb.ondragover = (e) => { e.preventDefault(); lb.classList.add("drag-over"); };
      lb.ondragleave = () => lb.classList.remove("drag-over");
      lb.ondrop = async (e) => {
        e.preventDefault();
        lb.classList.remove("drag-over");
        const src = JSON.parse(e.dataTransfer.getData("text/plain"));
        if (src.key !== key) return; // same domain only
        if (src.type === "item") {
          await setDomain(key, moveItem(b, src.list, list.id, src.item, b.lists.find((l) => l.id === list.id).items.length));
        } else if (src.type === "list" && src.list !== list.id) {
          const ids = [...b.lists].sort((a, c) => a.order - c.order).map((l) => l.id).filter((id) => id !== src.list);
          ids.splice(ids.indexOf(list.id), 0, src.list);
          await setDomain(key, reorderLists(b, ids));
        }
      };
      for (const item of items) lb.append(renderItem(key, list, item));
      block.append(lb);
```

> Keep the surrounding `for (const list of …)` loop, the `const items = …filter(matches)` line, the `if (!items.length) continue;` guard, and `blockHas = true;` exactly as they are; only the list-block construction and item-append portion changes as shown. An item dropped on a row inserts at that row's index (Step 4, `stopPropagation` prevents the list-block handler from also firing); an item dropped on empty list-block space appends; a list header dropped on another list-block reorders.

- [ ] **Step 6: Add CSS** — append to `src/app/app.css`:

```css
.has-note { font-size: 12px; }
.item-wrap { }
.details { padding: 4px 0 8px 28px; }
.detail-row { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0; }
.detail-label { width: 42px; color: var(--muted); font-size: 12px; padding-top: 5px; }
.link-input { flex: 1; padding: 4px 6px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
.note-input { flex: 1; padding: 4px 6px; border: 1px solid var(--line); border-radius: 6px; font: inherit; resize: vertical; }
.list-block.dragging { opacity: .5; }
.list-block.drag-over { outline: 2px dashed var(--indigo); outline-offset: 2px; }
.list-block > h3[draggable="true"] { cursor: grab; }
```

- [ ] **Step 7: Static checks**

Run: `node --check src/app/app.js`
Expected: exits 0.
Run: `grep -c "function renderItem" src/app/app.js`
Expected: `1`.
Run: `npm test`
Expected: unchanged pass count (app.js isn't imported by tests).

- [ ] **Step 8: Commit**

```bash
git add src/app/app.js src/app/app.css
git commit -m "feat: add item details panel and cross-list move + list reorder to full-page app"
```

> In-browser verification (expand item → edit link/notes → 🔗/📝 persist; drag item to another list; drag a list header to reorder; export/import still round-trips url/note) is deferred to the end-of-milestone manual pass.

---

## Self-Review

**Spec coverage:**
- One link per item via details panel → Tasks 2, 3. ✓
- Inline expandable details (link + notes) → Tasks 2, 3. ✓
- "Use this page" in popup only; app manual-entry only → Task 2 (button present), Task 3 (no button). ✓
- "Save this page" = popup button, blank text + url set, first list or new "Notes", focus for typing → Task 2 (`pendingEditId` → `editItem`). ✓
- 🔗 (http(s) only) + 📝 indicators → Tasks 2, 3 (reuse `isHttpUrl`). ✓
- Cross-list move + list reorder, full-app only, same domain → Task 3 (`moveItem`/`reorderLists`, `src.key === key`). ✓
- Non-mutating pure helpers, tested → Task 1. ✓
- `updatedAt` bumped on edits → Tasks 2, 3 (every handler). ✓
- No data-model / manifest / permission change; widget untouched → confirmed (no such edits in any task). ✓
- Export/import still covers url/note → unchanged; `validateBucket` already type-checks them. ✓

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `moveItem(bucket, fromListId, toListId, itemId, toIndex)` and `reorderLists(bucket, orderedListIds)` are defined in Task 1 and called with matching argument order/types in Task 3. dataTransfer payloads use a consistent shape: items `{type:"item", key, list, item}`, lists `{type:"list", key, list}`; the drop handlers branch on `src.type` and guard `src.key === key`. `detailsPanel` signatures differ intentionally per surface (popup: `(item)` with `scope` in scope; app: `(key, item)` needing the bucket) and each is defined in its own file.

**Known minor (acceptable, consistent with existing behavior):** the details panel's open/closed state is held in a module-level `Set` so it survives storage-driven re-renders; field focus is lost on the blur-save→re-render cycle (you blurred anyway). This matches the spec's "ephemeral UI state" non-goal.
