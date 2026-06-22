import { getAllDomains, subscribe } from "../lib/storage.js";

export const state = { domains: {}, filter: "all", selected: new Set(), search: "", hideDone: false };

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) n.append(c);
  return n;
}

function bucketKeys() {
  const keys = Object.keys(state.domains).sort();
  if (state.filter === "all") return keys;
  return keys.filter((k) => state.selected.has(k));
}

function matches(item) {
  if (state.hideDone && item.done) return false;
  if (state.search && !item.text.toLowerCase().includes(state.search.toLowerCase())) return false;
  return true;
}

function openCount(bucket) {
  return bucket.lists.reduce((n, l) => n + l.items.filter((i) => !i.done).length, 0);
}

function renderRail() {
  const rail = $("rail");
  rail.innerHTML = "";
  const total = Object.values(state.domains).reduce((n, b) => n + openCount(b), 0);
  const all = el("div", { className: "dom" + (state.filter === "all" ? " active" : "") }, [
    el("span", { textContent: "● All" }), el("span", { className: "count", textContent: String(total) }),
  ]);
  all.onclick = () => { state.filter = "all"; state.selected.clear(); render(); };
  rail.append(all);
  for (const key of Object.keys(state.domains).sort()) {
    const b = state.domains[key];
    const row = el("div", { className: "dom" + (state.filter === "sel" && state.selected.has(key) ? " active" : "") }, [
      el("span", { textContent: b.domain }), el("span", { className: "count", textContent: String(openCount(b)) }),
    ]);
    row.onclick = (e) => {
      state.filter = "sel";
      if (!e.metaKey && !e.ctrlKey) state.selected.clear();
      state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
      if (!state.selected.size) state.filter = "all";
      render();
    };
    rail.append(row);
  }
}

function renderTree() {
  const tree = $("tree");
  tree.innerHTML = "";
  const keys = bucketKeys();
  let shown = 0;
  for (const key of keys) {
    const b = state.domains[key];
    const block = el("div", { className: "domain-block" }, [el("h2", { textContent: b.domain })]);
    let blockHas = false;
    for (const list of [...b.lists].sort((a, c) => a.order - c.order)) {
      const items = [...list.items].sort((a, c) => a.order - c.order).filter(matches);
      if (!items.length) continue;
      blockHas = true;
      const done = list.items.filter((i) => i.done).length;
      const lb = el("div", { className: "list-block", dataset: { key, list: list.id } }, [
        el("h3", {}, [el("span", { textContent: list.name }), el("span", { className: "count", textContent: `${done}/${list.items.length}` })]),
      ]);
      for (const item of items) lb.append(renderItem(key, list, item));
      block.append(lb);
    }
    if (blockHas) { tree.append(block); shown++; }
  }
  if (!shown) tree.append(el("div", { className: "empty", textContent: "Nothing here yet." }));
}

// Overridden in Task 10 to add editing/drag. Read-only version here.
function renderItem(key, list, item) {
  const cb = el("input", { type: "checkbox", checked: item.done, disabled: true });
  const t = el("span", { className: "t", textContent: item.text });
  const row = el("div", { className: "item" + (item.done ? " done" : "") }, [cb, t]);
  if (item.pageUrl) row.append(el("span", { className: "pin", textContent: "★ " + item.pageUrl }));
  if (item.url) row.append(el("a", { href: item.url, target: "_blank", textContent: "🔗" }));
  return row;
}

export function render() {
  renderRail();
  renderTree();
}

export async function reload() {
  state.domains = await getAllDomains();
  render();
}

$("search").oninput = (e) => { state.search = e.target.value; renderTree(); };
$("hide-done").onchange = (e) => { state.hideDone = e.target.checked; renderTree(); };

subscribe(reload);
reload();

// Re-exported so Task 10 can extend rendering.
export { el, renderItem };
