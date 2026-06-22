import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

function installFakeChrome() {
  const store = {};
  const listeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return { ...store };
          if (typeof keys === "string") return keys in store ? { [keys]: store[keys] } : {};
          const out = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        },
        async set(obj) {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = { oldValue: store[k], newValue: v };
            store[k] = v;
          }
          listeners.forEach((fn) => fn(changes, "local"));
        },
        async remove(key) {
          const changes = { [key]: { oldValue: store[key], newValue: undefined } };
          delete store[key];
          listeners.forEach((fn) => fn(changes, "local"));
        },
      },
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
  };
  return { store, listeners };
}

let lib;
beforeEach(async () => {
  installFakeChrome();
  lib = await import("../src/lib/storage.js");
});

test("getMeta returns default when empty, then persists", async () => {
  assert.deepEqual(await lib.getMeta(), { schemaVersion: 1, settings: {} });
  await lib.setMeta({ schemaVersion: 1, settings: { a: 1 } });
  assert.deepEqual((await lib.getMeta()).settings, { a: 1 });
});

test("set/get/remove/getAll domains", async () => {
  await lib.setDomain("d:a.com", { domain: "a.com", widgetEnabled: true, lists: [] });
  await lib.setDomain("d:b.com", { domain: "b.com", widgetEnabled: true, lists: [] });
  await lib.setMeta({ schemaVersion: 1, settings: {} });
  assert.equal((await lib.getDomain("d:a.com")).domain, "a.com");
  assert.equal(await lib.getDomain("d:missing.com"), null);
  const all = await lib.getAllDomains();
  assert.deepEqual(Object.keys(all).sort(), ["d:a.com", "d:b.com"]);
  await lib.removeDomain("d:a.com");
  assert.equal(await lib.getDomain("d:a.com"), null);
});

test("subscribe fires on change and unsubscribe stops it", async () => {
  let hits = 0;
  const off = lib.subscribe(() => hits++);
  await lib.setDomain("d:a.com", { domain: "a.com", widgetEnabled: true, lists: [] });
  assert.equal(hits, 1);
  off();
  await lib.setDomain("d:c.com", { domain: "c.com", widgetEnabled: true, lists: [] });
  assert.equal(hits, 1);
});
