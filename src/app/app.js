import { getAllDomains, setDomain, removeDomain, subscribe, getMeta, setMeta } from "../lib/storage.js";
import { serializeStore, parseBackup, mergeStores, isHttpUrl, moveItem, reorderLists, dueState, allTags, sortItems, toMarkdown } from "../lib/model.js";

export const state = { domains: {}, filter: "all", selected: new Set(), search: "", hideDone: false, sort: "manual", selectedTags: new Set(), archivedView: false };
let meta = null;
const expanded = new Set();

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const { dataset, ...rest } = props;
  const n = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(n.dataset, dataset);
  for (const c of children) n.append(c);
  return n;
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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

function bucketKeys() {
  const keys = Object.keys(state.domains).sort();
  if (state.filter === "all") return keys;
  return keys.filter((k) => state.selected.has(k));
}

function matches(item) {
  if (state.archivedView ? !item.archived : item.archived) return false;
  if (state.hideDone && item.done) return false;
  if (state.search && !item.text.toLowerCase().includes(state.search.toLowerCase())) return false;
  if (state.selectedTags.size && !(item.tags ?? []).some((t) => state.selectedTags.has(t))) return false;
  return true;
}

// Global-view total: all open items for the domain (the toolbar badge is page-contextual and may differ).
function openCount(bucket) {
  return bucket.lists.reduce((n, l) => n + l.items.filter((i) => !i.done && !i.archived).length, 0);
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
      const items = sortItems(list.items, state.sort).filter(matches);
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
          await setDomain(key, moveItem(b, src.list, list.id, src.item, list.items.length));
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

  const rows = [linkRow, noteRow, dueRow, remindRow, repeatRow, tagsRow];
  if (!state.archivedView) {
    const archiveBtn = el("button", { className: "btn", textContent: item.archived ? "Restore" : "Archive" });
    archiveBtn.onclick = async () => { item.archived = !item.archived; item.updatedAt = Date.now(); await setDomain(key, b); };
    rows.push(el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "" }), archiveBtn]));
  }
  panel.append(...rows);
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

  const row = el("div", { className: "item" + (item.done ? " done" : ""), draggable: state.sort === "manual" }, [cb, t]);
  if (item.pageUrl) row.append(el("span", { className: "pin", textContent: "★ " + item.pageUrl }));
  if (isHttpUrl(item.url)) row.append(el("a", { href: item.url, target: "_blank", textContent: "🔗" }));
  if (item.note) row.append(el("span", { className: "has-note", textContent: "📝", title: "Has notes" }));
  if (item.due != null) {
    const flag = el("span", { className: "due-flag" + (dueState(item, Date.now()) === "overdue" ? " overdue" : ""), textContent: "📅 " + formatDue(item.due, Date.now()) });
    flag.title = new Date(item.due).toLocaleString();
    row.append(flag);
  }
  for (const tag of item.tags ?? []) row.append(el("span", { className: "tag-chip ro", textContent: "#" + tag }));

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

  if (state.archivedView) {
    const restore = el("button", { className: "btn", textContent: "Restore", title: "Restore" });
    restore.onclick = async () => { item.archived = false; item.updatedAt = Date.now(); await setDomain(key, b); };
    row.append(restore);
  }

  return el("div", { className: "item-wrap" }, [row, panel]);
}

export function render() {
  renderRail();
  renderTree();
}

export async function reload() {
  state.domains = await getAllDomains();
  meta = await getMeta();
  $("backup").value = meta.settings?.backupReminder ?? "off";
  render();
}

$("search").oninput = (e) => { state.search = e.target.value; renderTree(); };
$("hide-done").onchange = (e) => { state.hideDone = e.target.checked; renderTree(); };
$("sort").onchange = (e) => { state.sort = e.target.value; renderTree(); };

subscribe(reload);
reload();

function getSettingsAndExport() {
  const out = serializeStore({ domains: state.domains, settings: {} });
  out.exportedAt = new Date().toISOString();
  return JSON.stringify(out, null, 2);
}

$("export").onclick = () => download(`web-notes-backup-${new Date().toISOString().slice(0, 10)}.json`, getSettingsAndExport(), "application/json");

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

$("export-md").onclick = () => download(`web-notes-${new Date().toISOString().slice(0, 10)}.md`, toMarkdown(state.domains), "text/markdown");

$("backup").onchange = async (e) => {
  if (!meta) meta = await getMeta();
  meta.settings = meta.settings ?? {};
  meta.settings.backupReminder = e.target.value;
  if (e.target.value !== "off") meta.settings.lastBackupReminderAt = Date.now();
  await setMeta(meta);
};
