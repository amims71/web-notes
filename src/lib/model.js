export const SCHEMA_VERSION = 1;

export function newId() {
  return crypto.randomUUID();
}

export function makeItem(fields = {}, { id = newId(), now = Date.now() } = {}) {
  return {
    id,
    text: fields.text ?? "",
    done: false,
    url: fields.url ?? null,
    note: fields.note ?? null,
    pageUrl: fields.pageUrl ?? null,
    createdAt: now,
    updatedAt: now,
    order: fields.order ?? 0,
  };
}

export function makeList(name, { id = newId() } = {}) {
  return { id, name, collapsed: false, order: 0, items: [] };
}

export function makeDomainBucket(domain) {
  return { domain, widgetEnabled: true, lists: [] };
}

export function defaultMeta() {
  return { schemaVersion: SCHEMA_VERSION, settings: {} };
}

export function nextOrder(arr) {
  return arr.length ? Math.max(...arr.map((x) => x.order ?? 0)) + 1 : 0;
}

export function isHttpUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

export function validateBucket(b) {
  if (!b || typeof b !== "object") return false;
  if (typeof b.domain !== "string") return false;
  if (typeof b.widgetEnabled !== "boolean") return false;
  if (!Array.isArray(b.lists)) return false;
  return b.lists.every(
    (l) =>
      l && typeof l.id === "string" && typeof l.name === "string" && Array.isArray(l.items) &&
      l.items.every((it) =>
        it && typeof it.id === "string" && typeof it.text === "string" && typeof it.done === "boolean" &&
        (it.pageUrl === null || typeof it.pageUrl === "string") &&
        (it.url === null || typeof it.url === "string")),
  );
}

export function countOpenItems(bucket, { pageUrl } = {}) {
  if (!bucket || !Array.isArray(bucket.lists)) return 0;
  let n = 0;
  for (const list of bucket.lists)
    for (const it of list.items)
      if (!it.done && (it.pageUrl === null || it.pageUrl === pageUrl)) n++;
  return n;
}

export function serializeStore({ domains, settings }) {
  return { schemaVersion: SCHEMA_VERSION, domains: domains ?? {}, settings: settings ?? {} };
}

export function parseBackup(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error("Backup is not valid JSON.");
  }
  if (!data || data.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported or missing schema version.");
  if (!data.domains || typeof data.domains !== "object") throw new Error("Backup has no domains object.");
  for (const [key, bucket] of Object.entries(data.domains))
    if (!validateBucket(bucket)) throw new Error(`Invalid bucket for ${key}.`);
  return { schemaVersion: data.schemaVersion, domains: data.domains, settings: data.settings ?? {} };
}

function mergeItems(curItems, incItems) {
  const byId = new Map(curItems.map((it) => [it.id, it]));
  for (const inc of incItems) {
    const cur = byId.get(inc.id);
    if (!cur) byId.set(inc.id, inc);
    else if ((inc.updatedAt ?? 0) > (cur.updatedAt ?? 0)) byId.set(inc.id, inc);
  }
  return [...byId.values()];
}

export function mergeStores(current, incoming) {
  const out = {};
  for (const [key, bucket] of Object.entries(current)) out[key] = bucket;
  for (const [key, inc] of Object.entries(incoming)) {
    const cur = out[key];
    if (!cur) {
      out[key] = inc;
      continue;
    }
    const listsById = new Map(cur.lists.map((l) => [l.id, l]));
    for (const incList of inc.lists) {
      const curList = listsById.get(incList.id);
      if (!curList) listsById.set(incList.id, incList);
      else listsById.set(incList.id, { ...curList, items: mergeItems(curList.items, incList.items) });
    }
    out[key] = { ...cur, lists: [...listsById.values()] };
  }
  return out;
}
