import { getAllDomains, setDomain, removeDomain, subscribe } from "../lib/storage.js";
import { serializeStore, parseBackup, mergeStores, isHttpUrl, moveItem, reorderLists } from "../lib/model.js";

export const state = { domains: {}, filter: "all", selected: new Set(), search: "", hideDone: false };
const expanded = new Set();

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const { dataset, ...rest } = props;
  const n = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(n.dataset, dataset);
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

// Global-view total: all open items for the domain (the toolbar badge is page-contextual and may differ).
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
    }
    if (blockHas) { tree.append(block); shown++; }
  }
  if (!shown) tree.append(el("div", { className: "empty", textContent: "Nothing here yet." }));
}

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

function getSettingsAndExport() {
  const out = serializeStore({ domains: state.domains, settings: {} });
  out.exportedAt = new Date().toISOString();
  return JSON.stringify(out, null, 2);
}

$("export").onclick = () => {
  const blob = new Blob([getSettingsAndExport()], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `web-notes-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
};

$("import").onclick = () => $("import-file").click();
$("import-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch (err) {
    alert("Import failed: " + err.message);
    e.target.value = "";
    return;
  }
  const replace = confirm("OK = REPLACE all current data with the backup.\nCancel = MERGE the backup into current data.");
  const next = replace ? parsed.domains : mergeStores(state.domains, parsed.domains);
  if (replace) for (const key of Object.keys(state.domains)) if (!next[key]) await removeDomain(key);
  for (const [key, bucket] of Object.entries(next)) await setDomain(key, bucket);
  e.target.value = "";
  await reload();
};
