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

export function validateBucket(b) {
  if (!b || typeof b !== "object") return false;
  if (typeof b.domain !== "string") return false;
  if (typeof b.widgetEnabled !== "boolean") return false;
  if (!Array.isArray(b.lists)) return false;
  return b.lists.every(
    (l) =>
      l && typeof l.id === "string" && typeof l.name === "string" && Array.isArray(l.items) &&
      l.items.every((it) => it && typeof it.id === "string" && typeof it.text === "string" && typeof it.done === "boolean"),
  );
}
