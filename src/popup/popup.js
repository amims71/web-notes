import { resolveScope } from "../lib/scope.js";
import { makeDomainBucket, makeList, makeItem, nextOrder, isHttpUrl, dueState } from "../lib/model.js";
import { getDomain, setDomain, subscribe, getMeta, setMeta } from "../lib/storage.js";

let scope = null;
let bucket = null;
const expanded = new Set();
let pendingEditId = null;

const $ = (id) => document.getElementById(id);

function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

async function load() {
  const meta = await getMeta();
  applyTheme(meta.settings?.theme);
  $("theme").value = meta.settings?.theme ?? "auto";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  scope = resolveScope(tab?.url ?? "");
  if (scope.kind !== "web") {
    $("domain").textContent = "No site";
    $("lists").innerHTML = '<div class="empty">Open a website to take notes here.</div>';
    $("save-page").hidden = true;
    $("new-list").hidden = true;
    $("widget-toggle").closest("label").hidden = true;
    return;
  }
  $("domain").textContent = scope.domain;
  bucket = (await getDomain(scope.key)) ?? makeDomainBucket(scope.domain);
  render();
}

async function save() {
  await setDomain(scope.key, bucket);
}

function el(tag, props = {}, children = []) {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) n.append(c);
  return n;
}

let undoTimer = null;
function showUndo(onUndo) {
  let bar = document.getElementById("snackbar");
  if (!bar) { bar = el("div", { id: "snackbar", className: "snackbar" }); document.body.append(bar); }
  bar.replaceChildren(el("span", { textContent: "Deleted" }));
  const btn = el("button", { className: "link", textContent: "Undo" });
  btn.onclick = async () => { clearTimeout(undoTimer); bar.remove(); await onUndo(); };
  bar.append(btn);
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => bar.remove(), 5000);
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

function detailsPanel(item) {
  const panel = el("div", { className: "details" });
  panel.hidden = !expanded.has(item.id);

  const link = el("input", { type: "text", className: "link-input", value: item.url ?? "", placeholder: "https://…" });
  link.oninput = () => { item.url = link.value.trim() || null; };
  link.onchange = async () => { item.url = link.value.trim() || null; item.updatedAt = Date.now(); await save(); };
  const use = el("button", { className: "link small", textContent: "Use this page", title: "Use the current page URL" });
  use.onclick = async () => { if (!scope?.pageUrl) return; item.url = scope.pageUrl; item.updatedAt = Date.now(); await save(); };
  const clearLink = el("button", { className: "del", textContent: "✕", title: "Clear link" });
  clearLink.onclick = async () => { item.url = null; item.updatedAt = Date.now(); await save(); };
  const linkRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Link" }), link, use, clearLink]);

  const note = el("textarea", { className: "note-input", value: item.note ?? "", placeholder: "Notes…", rows: 2 });
  note.oninput = () => { item.note = note.value.trim() || null; };
  note.onchange = async () => { item.note = note.value.trim() || null; item.updatedAt = Date.now(); await save(); };
  const noteRow = el("div", { className: "detail-row" }, [el("span", { className: "detail-label", textContent: "Notes" }), note]);

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

  panel.append(linkRow, noteRow, dueRow, remindRow, repeatRow, tagsRow, archiveRow);
  return panel;
}

function itemRow(list, item) {
  const cb = el("input", { type: "checkbox", checked: item.done });
  cb.onchange = async () => { item.done = cb.checked; item.updatedAt = Date.now(); await save(); };

  const text = el("span", { className: "text", textContent: item.text });
  text.title = "Double-click to edit";
  text.ondblclick = () => editItem(text, item);

  const row = el("div", { className: "item" + (item.done ? " done" : "") }, [cb, text]);
  if (isHttpUrl(item.url)) row.append(el("a", { href: item.url, target: "_blank", textContent: "🔗", title: item.url }));
  if (item.note) row.append(el("span", { className: "has-note", textContent: "📝", title: "Has notes" }));
  if (item.due != null) {
    const flag = el("span", { className: "due-flag" + (dueState(item, Date.now()) === "overdue" ? " overdue" : ""), textContent: "📅 " + formatDue(item.due, Date.now()) });
    flag.title = new Date(item.due).toLocaleString();
    row.append(flag);
  }
  for (const tag of item.tags ?? []) row.append(el("span", { className: "tag-chip ro", textContent: "#" + tag }));

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
  del.onclick = async () => {
    const idx = list.items.indexOf(item);
    list.items = list.items.filter((x) => x !== item);
    expanded.delete(item.id);
    await save();
    showUndo(async () => {
      const l = bucket.lists.find((x) => x.id === list.id);
      if (!l) return;
      l.items.splice(Math.min(idx, l.items.length), 0, item);
      await save();
    });
  };
  row.append(del);

  if (pendingEditId === item.id) { pendingEditId = null; requestAnimationFrame(() => editItem(text, item)); }
  return el("div", { className: "item-wrap" }, [row, panel]);
}

function editItem(textEl, item) {
  const input = el("input", { type: "text", value: item.text });
  input.className = "text";
  const commit = async () => {
    item.text = input.value.trim() || item.text;
    item.updatedAt = Date.now();
    await save();
  };
  input.onkeydown = (e) => { if (e.key === "Enter") input.blur(); };
  input.onblur = commit;
  textEl.replaceWith(input);
  input.focus();
}

function addRow(list) {
  const input = el("input", { type: "text", placeholder: "+ add item…" });
  const pin = el("input", { type: "checkbox" });
  const label = el("label", { className: "pin" }, [pin, document.createTextNode(" this page")]);
  const row = el("div", { className: "add-row" }, [input, label]);
  input.onkeydown = async (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    list.items.push(makeItem({ text: input.value.trim(), order: nextOrder(list.items), pageUrl: pin.checked ? scope.pageUrl : null }));
    await save();
  };
  return row;
}

function render() {
  const root = $("lists");
  root.innerHTML = "";
  const lists = [...bucket.lists].sort((a, b) => a.order - b.order);
  if (!lists.length) root.append(el("div", { className: "empty", textContent: "No lists yet. Add one below." }));

  for (const list of lists) {
    const domainItems = list.items.filter((i) => i.pageUrl === null && !i.archived);
    const open = domainItems.filter((i) => !i.done).length;
    const name = el("span", { className: "name", textContent: list.name });
    const count = el("span", { className: "count", textContent: `${domainItems.length - open}/${domainItems.length}` });
    const del = el("button", { className: "del", textContent: "🗑", title: "Delete list" });
    del.onclick = async (e) => {
      e.stopPropagation();
      if (list.items.length && !confirm(`Delete list "${list.name}" and its ${list.items.length} item(s)?`)) return;
      bucket.lists = bucket.lists.filter((l) => l !== list);
      await save();
    };
    const head = el("div", { className: "list-head" }, [name, count, del]);
    const body = el("div");
    body.hidden = !!list.collapsed;
    head.onclick = async () => { list.collapsed = !list.collapsed; body.hidden = list.collapsed; await save(); };
    for (const item of domainItems.sort((a, b) => a.order - b.order)) body.append(itemRow(list, item));
    body.append(addRow(list));
    root.append(el("div", { className: "list" }, [head, body]));
  }

  renderPageSection();
  $("widget-toggle").checked = bucket.widgetEnabled;
}

function renderPageSection() {
  const pageItems = bucket.lists.flatMap((l) => l.items.filter((i) => i.pageUrl === scope.pageUrl && !i.archived).map((i) => ({ list: l, item: i })));
  const section = $("page-section");
  section.hidden = pageItems.length === 0;
  const box = $("page-items");
  box.innerHTML = "";
  for (const { list, item } of pageItems) box.append(itemRow(list, item));
}

$("save-page").onclick = async () => {
  if (scope?.kind !== "web") return;
  let list = [...bucket.lists].sort((a, b) => a.order - b.order)[0];
  if (!list) { list = makeList("Notes"); list.order = nextOrder(bucket.lists); bucket.lists.push(list); }
  const item = makeItem({ url: scope.pageUrl, order: nextOrder(list.items) });
  list.items.push(item);
  pendingEditId = item.id;
  await save();
};

$("new-list").onclick = async () => {
  const name = prompt("New list name:");
  if (!name?.trim()) return;
  const list = makeList(name.trim());
  list.order = nextOrder(bucket.lists);
  bucket.lists.push(list);
  await save();
};

$("widget-toggle").onchange = async (e) => {
  bucket.widgetEnabled = e.target.checked;
  await save();
};

$("theme").onchange = async (e) => {
  const m = await getMeta();
  m.settings = m.settings ?? {};
  m.settings.theme = e.target.value;
  await setMeta(m);
  applyTheme(e.target.value);
};

$("see-all").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("src/app/app.html") });

subscribe(async () => {
  if (scope?.kind === "web") {
    bucket = (await getDomain(scope.key)) ?? makeDomainBucket(scope.domain);
    render();
  }
});

load();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && scope?.kind === "web" && bucket) save(); });
