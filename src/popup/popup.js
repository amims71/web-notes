import { resolveScope } from "../lib/scope.js";
import { makeDomainBucket, makeList, makeItem, nextOrder } from "../lib/model.js";
import { getDomain, setDomain, subscribe } from "../lib/storage.js";

let scope = null;
let bucket = null;

const $ = (id) => document.getElementById(id);

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  scope = resolveScope(tab?.url ?? "");
  if (scope.kind !== "web") {
    $("domain").textContent = "No site";
    $("lists").innerHTML = '<div class="empty">Open a website to take notes here.</div>';
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

function itemRow(list, item) {
  const cb = el("input", { type: "checkbox", checked: item.done });
  cb.onchange = async () => {
    item.done = cb.checked;
    item.updatedAt = Date.now();
    await save();
  };
  const text = el("span", { className: "text", textContent: item.text });
  text.title = "Double-click to edit";
  text.ondblclick = () => editItem(text, item);
  const row = el("div", { className: "item" + (item.done ? " done" : "") }, [cb, text]);
  if (item.url) {
    const a = el("a", { href: item.url, target: "_blank", textContent: "🔗", title: item.url });
    row.append(a);
  }
  const del = el("button", { className: "del", textContent: "✕", title: "Delete" });
  del.onclick = async () => {
    list.items = list.items.filter((x) => x !== item);
    await save();
  };
  row.append(del);
  return row;
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
    const domainItems = list.items.filter((i) => i.pageUrl === null);
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
    head.onclick = () => { body.hidden = !body.hidden; };
    for (const item of domainItems.sort((a, b) => a.order - b.order)) body.append(itemRow(list, item));
    body.append(addRow(list));
    root.append(el("div", { className: "list" }, [head, body]));
  }

  renderPageSection();
  $("widget-toggle").checked = bucket.widgetEnabled;
}

function renderPageSection() {
  const pageItems = bucket.lists.flatMap((l) => l.items.filter((i) => i.pageUrl === scope.pageUrl).map((i) => ({ list: l, item: i })));
  const section = $("page-section");
  section.hidden = pageItems.length === 0;
  const box = $("page-items");
  box.innerHTML = "";
  for (const { list, item } of pageItems) box.append(itemRow(list, item));
}

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

$("see-all").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("src/app/app.html") });

subscribe(async () => {
  if (scope?.kind === "web") {
    bucket = (await getDomain(scope.key)) ?? makeDomainBucket(scope.domain);
    render();
  }
});

load();
