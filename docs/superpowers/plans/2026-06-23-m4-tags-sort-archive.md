# Milestone 4 — Tags, Sort & Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-item tags (chips + left-rail filter), full-app sort (Manual/Due/Created/Alpha), and a non-destructive Archive (hidden from normal views/counts; an Archived rail view restores items).

**Architecture:** New item fields `tags`/`archived`; pure tested helpers `sortItems`/`allTags` plus archive-exclusion in `countOpenItems`/`sweepDue`; UI in popup, full app, and widget follows existing patterns. Tags edited in the details panel; the full-app rail gains a Tags section and an Archived entry; the toolbar gains a Sort dropdown.

**Tech Stack:** Vanilla ES modules, no build step. Node's built-in test runner.

## Global Constraints

- **No build step**; load unpacked. **No new dependencies. No new permissions.**
- **`model.js` stays PURE** (no `chrome`); `sortItems`/`allTags` are **non-mutating**.
- **New item fields defaulted; absence ≡ default** (no migration). `validateBucket` accepts old items lacking them (`== null`).
- **Archived items are excluded everywhere except the full-app Archived view:** `countOpenItems` and `sweepDue` and all normal renders skip `archived`.
- **Tag match:** OR within selected tags (item matches if it has ANY selected tag), AND with the domain filter. Tags stored lower-cased, trimmed, deduped.
- **Sort** is a session toolbar control (default `manual`); applied within each list via `sortItems`.
- **Widget:** excludes archived; no tag chips this milestone.
- **Code comments:** only what isn't obvious; match density; no narration.
- **Commit** after each task. Small commits.

---

### Task 1: `model.js` — item fields `tags`/`archived` + validation (TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-tags-fields.test.js`

**Interfaces:**
- Produces: `makeItem` sets `tags` (default `[]`) and `archived` (default `false`); `validateBucket` accepts/rejects them.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeDomainBucket, makeList, validateBucket } from "../src/lib/model.js";

test("makeItem defaults tags=[] and archived=false, keeps provided", () => {
  const d = makeItem({ text: "x" }, { id: "i", now: 1 });
  assert.deepEqual(d.tags, []);
  assert.equal(d.archived, false);
  const e = makeItem({ text: "y", tags: ["a", "b"], archived: true }, { id: "j", now: 1 });
  assert.deepEqual(e.tags, ["a", "b"]);
  assert.equal(e.archived, true);
});

test("validateBucket accepts items missing tags/archived (old backups)", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items.push({ id: "i1", text: "t", done: false, url: null, note: null, pageUrl: null, createdAt: 1, updatedAt: 1, order: 0 });
  b.lists.push(l);
  assert.equal(validateBucket(b), true);
});

test("validateBucket accepts valid tags/archived and rejects wrong types", () => {
  const ok = makeDomainBucket("a.com");
  const lo = makeList("L", { id: "l1" });
  lo.items.push(makeItem({ text: "t", tags: ["x"], archived: true }, { id: "i1", now: 1 }));
  ok.lists.push(lo);
  assert.equal(validateBucket(ok), true);

  const mk = (over) => {
    const b = makeDomainBucket("a.com");
    const l = makeList("L", { id: "l1" });
    l.items.push({ ...makeItem({ text: "t" }, { id: "i1", now: 1 }), ...over });
    b.lists.push(l);
    return b;
  };
  assert.equal(validateBucket(mk({ tags: "x" })), false);
  assert.equal(validateBucket(mk({ tags: [1, 2] })), false);
  assert.equal(validateBucket(mk({ archived: "yes" })), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-tags-fields.test.js`
Expected: FAIL.

- [ ] **Step 3: Add fields to `makeItem`** — add to the object returned by `makeItem` (after the `repeat:` line):

```js
    tags: fields.tags ?? [],
    archived: fields.archived ?? false,
```

- [ ] **Step 4: Extend `validateBucket`** — append to the item `.every(...)` predicate:

```js
      && (it.tags == null || (Array.isArray(it.tags) && it.tags.every((t) => typeof t === "string")))
      && (it.archived == null || typeof it.archived === "boolean")
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/model-tags-fields.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/model.js test/model-tags-fields.test.js
git commit -m "feat: add tags/archived item fields with validation"
```

---

### Task 2: `model.js` — `sortItems`, `allTags`, archive exclusion (TDD)

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-organize.test.js`

**Interfaces:**
- Produces:
  - `sortItems(items, mode): Item[]` — new sorted array; `manual` (order) / `due` (asc, nulls last) / `created` (createdAt) / `alpha` (text, case-insensitive).
  - `allTags(domainsMap): string[]` — sorted unique tags across all buckets.
  - `countOpenItems` and `sweepDue` now exclude archived items.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, sortItems, allTags, countOpenItems, sweepDue } from "../src/lib/model.js";

const mk = (over, id) => ({ ...makeItem({ text: over.text ?? id }, { id, now: 1 }), ...over });

test("sortItems manual/due/created/alpha, non-mutating", () => {
  const items = [
    mk({ order: 2, due: 300, createdAt: 10, text: "Banana" }, "a"),
    mk({ order: 0, due: null, createdAt: 30, text: "apple" }, "b"),
    mk({ order: 1, due: 100, createdAt: 20, text: "Cherry" }, "c"),
  ];
  const snap = JSON.parse(JSON.stringify(items));
  assert.deepEqual(sortItems(items, "manual").map((i) => i.id), ["b", "c", "a"]);
  assert.deepEqual(sortItems(items, "due").map((i) => i.id), ["c", "a", "b"]); // nulls last
  assert.deepEqual(sortItems(items, "created").map((i) => i.id), ["a", "c", "b"]);
  assert.deepEqual(sortItems(items, "alpha").map((i) => i.id), ["b", "a", "c"]); // apple,Banana,Cherry
  assert.deepEqual(items, snap); // non-mutating
});

test("allTags returns sorted unique tags across buckets", () => {
  const domains = {
    "d:a.com": (() => { const b = makeDomainBucket("a.com"); const l = makeList("L", { id: "l1" }); l.items = [mk({ tags: ["z", "a"] }, "1"), mk({ tags: ["a"] }, "2")]; b.lists = [l]; return b; })(),
    "d:b.com": (() => { const b = makeDomainBucket("b.com"); const l = makeList("L", { id: "l2" }); l.items = [mk({ tags: ["m"] }, "3")]; b.lists = [l]; return b; })(),
  };
  assert.deepEqual(allTags(domains), ["a", "m", "z"]);
});

test("countOpenItems excludes archived", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [mk({ done: false }, "1"), mk({ done: false, archived: true }, "2")];
  b.lists = [l];
  assert.equal(countOpenItems(b, { pageUrl: null }), 1);
});

test("sweepDue skips archived", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [mk({ due: 100, archived: true }, "1")];
  b.lists = [l];
  assert.deepEqual(sweepDue(b, 50, 200).due.map((i) => i.id), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-organize.test.js`
Expected: FAIL — `sortItems`/`allTags` not exported (and archive exclusion not yet applied).

- [ ] **Step 3: Append helpers + update exclusion in `src/lib/model.js`**

Append:

```js
export function sortItems(items, mode) {
  const copy = [...items];
  if (mode === "due") return copy.sort((a, b) => (a.due == null) - (b.due == null) || (a.due ?? 0) - (b.due ?? 0));
  if (mode === "created") return copy.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  if (mode === "alpha") return copy.sort((a, b) => (a.text || "").localeCompare(b.text || "", undefined, { sensitivity: "base" }));
  return copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function allTags(domainsMap) {
  const set = new Set();
  for (const bucket of Object.values(domainsMap ?? {}))
    for (const list of bucket.lists ?? [])
      for (const item of list.items ?? [])
        for (const t of item.tags ?? []) set.add(t);
  return [...set].sort();
}
```

Then update the existing `countOpenItems` inner condition to also exclude archived — change:

```js
      if (!it.done && (it.pageUrl === null || it.pageUrl === pageUrl)) n++;
```

to:

```js
      if (!it.done && !it.archived && (it.pageUrl === null || it.pageUrl === pageUrl)) n++;
```

And update the existing `sweepDue` skip line — change:

```js
      if (item.done || item.due == null) return item;
```

to:

```js
      if (item.done || item.archived || item.due == null) return item;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model-organize.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS (no regressions in existing count/sweep tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.js test/model-organize.test.js
git commit -m "feat: add sortItems/allTags and exclude archived from counts/reminders"
```

---

### Task 3: Popup — tags + archive + exclude archived

**Files:**
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`

**Interfaces:**
- Consumes: existing `el`, `save`, `detailsPanel`, `itemRow`, `render`, `renderPageSection`.
- Produces: popup tag editing/display + archive action; archived items hidden.

Read `src/popup/popup.js` first.

- [ ] **Step 1: Add the Tags row + Archive button to `detailsPanel`** — in `detailsPanel(item)`, before the final `panel.append(...)`, add:

```js
  const tagWrap = el("div", { className: "tags-edit" });
  for (const tag of item.tags ?? []) {
    const chip = el("span", { className: "tag-chip", textContent: "#" + tag });
    const x = el("button", { className: "tag-x", textContent: "✕", title: "Remove tag" });
    x.onclick = async () => { item.tags = (item.tags ?? []).filter((t) => t !== tag); item.updatedAt = Date.now(); await save(); };
    chip.append(x);
    tagWrap.append(chip);
  }
  const tagInput = el("input", { type: "text", className: "tag-input", placeholder: "+ tag" });
  tagInput.onkeydown = async (e) => {
    if (e.key !== "Enter") return;
    const t = tagInput.value.trim().toLowerCase();
    tagInput.value = "";
    const tags = item.tags ?? [];
    if (t && !tags.includes(t)) { item.tags = [...tags, t]; item.updatedAt = Date.now(); await save(); }
  };
  tagWrap.append(tagInput);
  const tagsRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Tags" }), tagWrap]);

  const archiveBtn = el("button", { className: "link small", textContent: "Archive" });
  archiveBtn.onclick = async () => { item.archived = true; item.updatedAt = Date.now(); await save(); };
  const archiveRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "" }), archiveBtn]);
```

Then change the final append to include the two new rows:

```js
  panel.append(linkRow, noteRow, dueRow, remindRow, repeatRow, tagsRow, archiveRow);
```

- [ ] **Step 2: Show tag chips on the row in `itemRow`** — in `itemRow`, right after the due-indicator block (the `if (item.due != null) {...}`), add:

```js
  for (const tag of item.tags ?? []) row.append(el("span", { className: "tag-chip ro", textContent: "#" + tag }));
```

- [ ] **Step 3: Exclude archived from the popup views** — in `render`, change the domain-items filter from:

```js
    const domainItems = list.items.filter((i) => i.pageUrl === null);
```

to:

```js
    const domainItems = list.items.filter((i) => i.pageUrl === null && !i.archived);
```

And in `renderPageSection`, change the page-items computation from:

```js
  const pageItems = bucket.lists.flatMap((l) => l.items.filter((i) => i.pageUrl === scope.pageUrl).map((i) => ({ list: l, item: i })));
```

to:

```js
  const pageItems = bucket.lists.flatMap((l) => l.items.filter((i) => i.pageUrl === scope.pageUrl && !i.archived).map((i) => ({ list: l, item: i })));
```

- [ ] **Step 4: Add CSS** — append to `src/popup/popup.css`:

```css
.tags-edit { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; align-items: center; }
.tag-chip { background: #eef2ff; color: var(--indigo); border-radius: 10px; padding: 1px 7px; font-size: 11px; display: inline-flex; align-items: center; gap: 3px; }
.tag-chip.ro { background: #f3f4f6; color: var(--muted); }
.tag-x { background: none; border: none; color: inherit; cursor: pointer; font-size: 10px; padding: 0; }
.tag-input { border: 1px solid var(--line); border-radius: 4px; padding: 2px 5px; font: inherit; min-width: 60px; flex: 1; }
```

- [ ] **Step 5: Static checks**

Run: `node --check src/popup/popup.js`
Expected: exits 0.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 6: Commit**

```bash
git add src/popup/popup.js src/popup/popup.css
git commit -m "feat: add tags and archive to popup; hide archived items"
```

---

### Task 4: Full-page app — tags, rail filter, Archived view, sort, archive/restore

**Files:**
- Modify: `src/app/app.js`
- Modify: `src/app/app.css`
- Modify: `src/app/app.html`

**Interfaces:**
- Consumes: `allTags`, `sortItems`, `dueState` (model.js, add to import); existing `el`, `state`, `setDomain`, `render`, `renderRail`, `renderTree`, `matches`, `detailsPanel(key,item)`, `renderItem`, `bucketKeys`.
- Produces: the full-app organize features.

Read `src/app/app.js` and `src/app/app.html` first.

- [ ] **Step 1: Update the model import** — add `allTags, sortItems` to the existing `from "../lib/model.js"` import.

- [ ] **Step 2: Extend `state`** — change the `export const state = {...}` to add three fields:

```js
export const state = { domains: {}, filter: "all", selected: new Set(), search: "", hideDone: false, sort: "manual", selectedTags: new Set(), archivedView: false };
```

- [ ] **Step 3: Update `matches`** — replace the `matches` function with:

```js
function matches(item) {
  if (state.archivedView ? !item.archived : item.archived) return false;
  if (state.hideDone && item.done) return false;
  if (state.search && !item.text.toLowerCase().includes(state.search.toLowerCase())) return false;
  if (state.selectedTags.size && !(item.tags ?? []).some((t) => state.selectedTags.has(t))) return false;
  return true;
}
```

- [ ] **Step 4: Apply the sort in `renderTree`** — in `renderTree`, replace the per-list items computation line:

```js
      const items = [...list.items].sort((a, c) => a.order - c.order).filter(matches);
```

with:

```js
      const items = sortItems(list.items, state.sort).filter(matches);
```

- [ ] **Step 5: Add tag chips + Restore to `renderItem`** — in `renderItem`, after the due-indicator block, add tag chips:

```js
  for (const tag of item.tags ?? []) row.append(el("span", { className: "tag-chip ro", textContent: "#" + tag }));
```

And right before `return el("div", { className: "item-wrap" }, [row, panel]);`, add a Restore button shown only in the Archived view:

```js
  if (state.archivedView) {
    const restore = el("button", { className: "btn", textContent: "Restore", title: "Restore" });
    restore.onclick = async () => { item.archived = false; item.updatedAt = Date.now(); await setDomain(key, b); };
    row.append(restore);
  }
```

- [ ] **Step 6: Add the Tags row + Archive button to `detailsPanel`** — in `detailsPanel(key, item)`, before the final `panel.append(...)`, add:

```js
  const tagWrap = el("div", { className: "tags-edit" });
  for (const tag of item.tags ?? []) {
    const chip = el("span", { className: "tag-chip", textContent: "#" + tag });
    const x = el("button", { className: "tag-x", textContent: "✕", title: "Remove tag" });
    x.onclick = async () => { item.tags = (item.tags ?? []).filter((t) => t !== tag); item.updatedAt = Date.now(); await setDomain(key, b); };
    chip.append(x);
    tagWrap.append(chip);
  }
  const tagInput = el("input", { type: "text", className: "tag-input", placeholder: "+ tag" });
  tagInput.onkeydown = async (e) => {
    if (e.key !== "Enter") return;
    const t = tagInput.value.trim().toLowerCase();
    tagInput.value = "";
    const tags = item.tags ?? [];
    if (t && !tags.includes(t)) { item.tags = [...tags, t]; item.updatedAt = Date.now(); await setDomain(key, b); }
  };
  tagWrap.append(tagInput);
  const tagsRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Tags" }), tagWrap]);

  const archiveBtn = el("button", { className: "btn", textContent: item.archived ? "Restore" : "Archive" });
  archiveBtn.onclick = async () => { item.archived = !item.archived; item.updatedAt = Date.now(); await setDomain(key, b); };
  const archiveRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "" }), archiveBtn]);
```

Then change the final append to include both:

```js
  panel.append(linkRow, noteRow, dueRow, remindRow, repeatRow, tagsRow, archiveRow);
```

- [ ] **Step 7: Add the Tags section + Archived entry to `renderRail`** — in `renderRail`, after the existing domain loop (after the closing `}` of `for (const key of Object.keys(state.domains).sort())`), add:

```js
  const tags = allTags(state.domains);
  if (tags.length) {
    rail.append(el("div", { className: "rail-heading", textContent: "TAGS" }));
    for (const tag of tags) {
      const row = el("div", { className: "dom" + (state.selectedTags.has(tag) ? " active" : "") }, [el("span", { textContent: "#" + tag })]);
      row.onclick = (e) => {
        if (!e.metaKey && !e.ctrlKey) { const had = state.selectedTags.has(tag); state.selectedTags.clear(); if (!had) state.selectedTags.add(tag); }
        else state.selectedTags.has(tag) ? state.selectedTags.delete(tag) : state.selectedTags.add(tag);
        render();
      };
      rail.append(row);
    }
  }
  const archCount = Object.values(state.domains).reduce((n, b) => n + b.lists.reduce((m, l) => m + l.items.filter((i) => i.archived).length, 0), 0);
  const arch = el("div", { className: "dom" + (state.archivedView ? " active" : "") }, [el("span", { textContent: "🗄 Archived" }), el("span", { className: "count", textContent: String(archCount) })]);
  arch.onclick = () => { state.archivedView = !state.archivedView; render(); };
  rail.append(arch);
```

- [ ] **Step 8: Add the Sort dropdown to the toolbar** — in `src/app/app.html`, add this `<select>` inside the header, right after the `hide-done` label:

```html
      <label>Sort
        <select id="sort">
          <option value="manual">Manual</option>
          <option value="due">Due date</option>
          <option value="created">Created</option>
          <option value="alpha">Alphabetical</option>
        </select>
      </label>
```

And in `src/app/app.js`, wire it near the other control handlers (e.g. after `$("hide-done").onchange = ...`):

```js
$("sort").onchange = (e) => { state.sort = e.target.value; renderTree(); };
```

- [ ] **Step 9: Add CSS** — append to `src/app/app.css`:

```css
.tags-edit { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; align-items: center; }
.tag-chip { background: #eef2ff; color: var(--indigo); border-radius: 11px; padding: 1px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
.tag-chip.ro { background: #f3f4f6; color: var(--muted); font-size: 11px; }
.tag-x { background: none; border: none; color: inherit; cursor: pointer; font-size: 11px; padding: 0; }
.tag-input { border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; font: inherit; min-width: 70px; }
.rail-heading { font-size: 11px; color: var(--muted); margin: 10px 6px 2px; letter-spacing: .04em; }
```

- [ ] **Step 10: Static checks**

Run: `node --check src/app/app.js`
Expected: exits 0.
Run: `grep -c "function renderItem" src/app/app.js` and `grep -c "function detailsPanel" src/app/app.js`
Expected: each `1`.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 11: Commit**

```bash
git add src/app/app.js src/app/app.css src/app/app.html
git commit -m "feat: add tags, rail tag filter, Archived view, and sort to full-page app"
```

---

### Task 5: Widget — exclude archived items

**Files:**
- Modify: `src/content/widget.js`

**Interfaces:**
- Produces: archived items no longer appear in the widget.

Read `src/content/widget.js` first.

- [ ] **Step 1: Exclude archived in `openItems`** — change the filter condition from:

```js
        if (!it.done && (it.pageUrl === null || it.pageUrl === scope.pageUrl)) out.push({ list: l, item: it });
```

to:

```js
        if (!it.done && !it.archived && (it.pageUrl === null || it.pageUrl === scope.pageUrl)) out.push({ list: l, item: it });
```

- [ ] **Step 2: Static checks**

Run: `node --check src/content/widget.js`
Expected: exits 0.
Run: `npm test`
Expected: unchanged pass count.

- [ ] **Step 3: Commit**

```bash
git add src/content/widget.js
git commit -m "feat: exclude archived items from the floating widget"
```

---

## Self-Review

**Spec coverage:**
- `tags`/`archived` fields + validation (accept old backups) → Task 1. ✓
- `sortItems`/`allTags` (pure, tested, non-mutating) → Task 2. ✓
- Archive exclusion in `countOpenItems` + `sweepDue` → Task 2. ✓
- Popup: tag edit + chips + archive + hide archived → Task 3. ✓
- App: tag edit + chips; rail Tags section (OR-within, AND-with-domain via `matches` + `bucketKeys`); Archived view + Restore; sort dropdown; archive button → Task 4. ✓
- Widget excludes archived → Task 5. ✓
- Tags lower-cased/trimmed/deduped → Tasks 3, 4 (`trim().toLowerCase()`, `includes` guard). ✓
- Export/import preserves tags/archived → unchanged (whole-object serialize; `validateBucket` updated in Task 1). ✓
- No new permissions; widget no tag chips → confirmed. ✓

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `sortItems(items, mode)` and `allTags(domainsMap)` defined in Task 2, consumed in Task 4 with matching args. `state.sort`/`state.selectedTags`/`state.archivedView` added in Task 4 Step 2 and read in `matches`/`renderTree`/`renderRail` in the same task. `item.tags` always read as `item.tags ?? []`. `tag-chip`/`tag-x`/`tag-input`/`tags-edit`/`rail-heading` CSS classes match the JS. Archive exclusion condition (`!it.archived`) consistent across model (Task 2), popup (Task 3), app `matches` (Task 4), widget (Task 5).

**Note:** drag-reorder still mutates `order`; under a non-`manual` sort the reorder isn't visually reflected until switching back to Manual. Acceptable for v1 (no disabling of drag per sort mode). The Archived view reuses the normal tree (with Restore buttons) and the same domain/sort controls; tag filter also applies there.
