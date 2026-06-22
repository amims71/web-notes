(async () => {
  const base = (p) => chrome.runtime.getURL(p);
  const { resolveScope } = await import(base("src/lib/scope.js"));
  const scope = resolveScope(location.href);
  if (scope.kind !== "web") return;

  const { makeItem, nextOrder, countOpenItems } = await import(base("src/lib/model.js"));
  const { getDomain, setDomain, subscribe } = await import(base("src/lib/storage.js"));

  const host = document.createElement("div");
  host.id = "__web_notes_host";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = await (await fetch(base("src/content/widget.css"))).text();
  root.append(style);
  const container = document.createElement("div");
  container.className = "host";
  root.append(container);

  let corner = { right: "16px", bottom: "16px" };
  let expanded = false;
  let bucket = null;

  function placement() {
    Object.assign(container.style, { right: corner.right, bottom: corner.bottom, left: "auto", top: "auto" });
  }

  function openItems() {
    const out = [];
    for (const l of bucket?.lists ?? [])
      for (const it of l.items)
        if (!it.done && (it.pageUrl === null || it.pageUrl === scope.pageUrl)) out.push({ list: l, item: it });
    return out;
  }

  async function save() { await setDomain(scope.key, bucket); }

  function render() {
    container.innerHTML = "";
    if (!bucket || bucket.widgetEnabled === false) { document.documentElement.contains(host) && host.remove(); return; }
    const count = countOpenItems(bucket, { pageUrl: scope.pageUrl });
    if (count === 0 && !expanded) { document.documentElement.contains(host) && host.remove(); return; }
    if (!document.documentElement.contains(host)) document.documentElement.append(host);
    placement();

    if (!expanded) {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = `📝 ${count}`;
      bubble.onclick = () => { expanded = true; render(); };
      makeDraggable(bubble);
      container.append(bubble);
      return;
    }

    const panel = document.createElement("div");
    panel.className = "panel";
    const header = document.createElement("header");
    header.append(document.createTextNode(scope.domain));
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "✕";
    close.title = "Hide widget on this domain";
    close.onclick = async () => { bucket.widgetEnabled = false; await save(); };
    const collapse = document.createElement("button");
    collapse.className = "close";
    collapse.textContent = "—";
    collapse.title = "Collapse";
    collapse.onclick = () => { expanded = false; render(); };
    const ctrl = document.createElement("span");
    ctrl.append(collapse, close);
    header.append(ctrl);
    panel.append(header);

    for (const { list, item } of openItems()) {
      const row = document.createElement("div");
      row.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.onchange = async () => { item.done = true; item.updatedAt = Date.now(); await save(); };
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = item.text;
      row.append(cb, t);
      panel.append(row);
    }

    const add = document.createElement("input");
    add.className = "add";
    add.placeholder = "+ quick add to first list…";
    add.onkeydown = async (e) => {
      if (e.key !== "Enter" || !add.value.trim()) return;
      let list = bucket.lists[0];
      if (!list) { list = { id: crypto.randomUUID(), name: "Notes", collapsed: false, order: 0, items: [] }; bucket.lists.push(list); }
      list.items.push(makeItem({ text: add.value.trim(), order: nextOrder(list.items) }));
      await save();
    };
    panel.append(add);

    const more = document.createElement("a");
    more.className = "more";
    more.textContent = "Open full app ⤢";
    more.onclick = () => chrome.runtime.sendMessage({ type: "open-app" });
    panel.append(more);

    container.append(panel);
  }

  function makeDraggable(node) {
    let sx, sy, moved;
    node.addEventListener("pointerdown", (e) => {
      sx = e.clientX; sy = e.clientY; moved = false;
      node.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
        corner = { right: `${Math.max(8, innerWidth - ev.clientX - 20)}px`, bottom: `${Math.max(8, innerHeight - ev.clientY - 20)}px` };
        placement();
      };
      const up = () => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        if (moved) node.onclick = (ev) => ev.stopPropagation();
        else { expanded = true; render(); }
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    });
  }

  async function reload() { bucket = await getDomain(scope.key); render(); }
  subscribe(reload);
  await reload();
})();
