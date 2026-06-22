# Web Notes Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chromium MV3 browser extension that stores notes/todos/lists scoped per website domain, entirely in local storage, surfaced via a toolbar popup, an on-page floating widget, and a full-page app.

**Architecture:** Three UI surfaces (popup, content-script widget, full-page app) plus a background service worker, all sharing one `chrome.storage.local` and subscribing to `chrome.storage.onChanged` for live sync. Pure logic lives in `src/lib/` (scope resolution, data model, storage access) and is unit-tested in plain Node; UI files are thin wrappers over `src/lib/`.

**Tech Stack:** Vanilla HTML/CSS/JS ES modules. No build step (load unpacked). Tests via Node's built-in `node:test` + `node:assert` (no npm dependencies). Content-script widget loads `src/lib/` via dynamic `import(chrome.runtime.getURL(...))`.

## Global Constraints

- **No build step.** The extension must load unpacked directly; `package.json` exists only to run tests, never to bundle the extension.
- **No runtime dependencies.** `src/lib/` and all UI use only browser/extension APIs. Tests use only Node built-ins.
- **Manifest V3, Chromium** (Chrome/Edge). Firefox is out of scope.
- **Storage:** `chrome.storage.local` only, with the `unlimitedStorage` permission. No `chrome.storage.sync`.
- **Pure `src/lib/` modules** must reference `chrome.*` only inside function bodies (never at module top level) so tests can stub `globalThis.chrome` lazily. `scope.js` and `model.js` must not reference `chrome` at all.
- **IDs** use `crypto.randomUUID()`; **timestamps** use `Date.now()`. Both must be injectable via an options argument in factory functions so tests are deterministic.
- **Data model** is exactly as defined in the spec: `docs/superpowers/specs/2026-06-22-web-notes-extension-design.md`. Storage keys: `meta` and `d:<registrable-domain>`.
- **Code comments:** comment only what isn't obvious from the code; match the surrounding density. No narration comments.
- **Commit** after every task's tests pass (or after manual verification for UI tasks).

---

### Task 1: Scaffold — manifest, icons, test harness

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `scripts/make-icons.mjs`
- Create: `icons/16.png`, `icons/32.png`, `icons/48.png`, `icons/128.png` (generated)
- Create: `test/smoke.test.js`

**Interfaces:**
- Produces: the directory layout and `npm test` command (runs `node --test`) that all later tasks rely on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "web-notes",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "icons": "node scripts/make-icons.mjs"
  }
}
```

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Web Notes",
  "version": "0.1.0",
  "description": "Per-domain notes, todos, and lists, stored locally.",
  "permissions": ["storage", "unlimitedStorage", "tabs"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" }
  },
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },
  "background": { "service_worker": "src/background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["src/content/widget.js"], "run_at": "document_idle" }
  ],
  "web_accessible_resources": [
    { "resources": ["src/lib/scope.js", "src/lib/model.js", "src/lib/storage.js", "src/content/widget.css"], "matches": ["<all_urls>"] }
  ]
}
```

- [ ] **Step 3: Create `scripts/make-icons.mjs`** (dependency-free PNG generator — solid indigo squares)

```js
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const color = [0x4f, 0x46, 0xe5, 0xff];
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = color[0]; raw[o++] = color[1]; raw[o++] = color[2]; raw[o++] = color[3];
    }
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("icons", { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(`icons/${size}.png`, png(size));
console.log("icons written");
```

- [ ] **Step 4: Generate the icons**

Run: `npm run icons`
Expected: prints `icons written`; `icons/16.png`, `32.png`, `48.png`, `128.png` exist.

- [ ] **Step 5: Create `test/smoke.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("test harness runs", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 6: Run the test harness**

Run: `npm test`
Expected: 1 test passes, exit code 0.

- [ ] **Step 7: Verify the extension loads unpacked**

Manual: open `chrome://extensions`, enable Developer mode, "Load unpacked", select the project root. Expected: "Web Notes" appears with the indigo icon and no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold MV3 extension, icons, and node:test harness"
```

---

### Task 2: `src/lib/scope.js` — registrable domain + scope resolution

**Files:**
- Create: `src/lib/scope.js`
- Test: `test/scope.test.js`

**Interfaces:**
- Produces:
  - `registrableDomain(hostname: string): string`
  - `canonicalPageUrl(urlString: string): string` — href without the hash fragment.
  - `resolveScope(urlString: string): { kind: "web", key: string, domain: string, hostname: string, pageUrl: string } | { kind: "none" }` — `key` is `"d:" + domain`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { registrableDomain, canonicalPageUrl, resolveScope } from "../src/lib/scope.js";

test("registrableDomain collapses subdomains", () => {
  assert.equal(registrableDomain("app.github.com"), "github.com");
  assert.equal(registrableDomain("gist.github.com"), "github.com");
  assert.equal(registrableDomain("github.com"), "github.com");
});

test("registrableDomain handles multi-part TLDs", () => {
  assert.equal(registrableDomain("foo.bar.co.uk"), "bar.co.uk");
  assert.equal(registrableDomain("shop.example.com.au"), "example.com.au");
});

test("registrableDomain returns single-label and IP hosts as-is", () => {
  assert.equal(registrableDomain("localhost"), "localhost");
  assert.equal(registrableDomain("192.168.1.4"), "192.168.1.4");
});

test("canonicalPageUrl drops the hash", () => {
  assert.equal(canonicalPageUrl("https://a.com/x?y=1#frag"), "https://a.com/x?y=1");
});

test("resolveScope maps web URLs to a domain key", () => {
  const s = resolveScope("https://app.github.com/issues#x");
  assert.deepEqual(s, {
    kind: "web",
    key: "d:github.com",
    domain: "github.com",
    hostname: "app.github.com",
    pageUrl: "https://app.github.com/issues",
  });
});

test("resolveScope returns none for non-web schemes", () => {
  assert.equal(resolveScope("chrome://extensions").kind, "none");
  assert.equal(resolveScope("about:blank").kind, "none");
  assert.equal(resolveScope("not a url").kind, "none");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/scope.test.js`
Expected: FAIL — cannot find module `../src/lib/scope.js`.

- [ ] **Step 3: Implement `src/lib/scope.js`**

```js
// Second-level public suffixes where the registrable domain needs three labels.
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.nz", "org.nz", "govt.nz", "ac.nz",
  "co.in", "net.in", "org.in", "gen.in", "firm.in",
  "co.za", "org.za", "net.za",
  "com.br", "net.br", "org.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "com.mx", "com.tr", "com.sg", "com.hk", "com.tw", "com.ar", "com.pl",
  "co.kr", "or.kr", "co.id", "co.th", "com.ua",
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function registrableDomain(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, "");
  if (!host) return host;
  if (host.includes(":") || IPV4.test(host)) return host; // IPv6/IPv4 literal
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

export function canonicalPageUrl(urlString) {
  const u = new URL(urlString);
  return u.origin + u.pathname + u.search;
}

export function resolveScope(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return { kind: "none" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { kind: "none" };
  const domain = registrableDomain(u.hostname);
  return {
    kind: "web",
    key: "d:" + domain,
    domain,
    hostname: u.hostname,
    pageUrl: canonicalPageUrl(urlString),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/scope.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scope.js test/scope.test.js
git commit -m "feat: add scope resolution (registrable domain + page url)"
```

---

### Task 3: `src/lib/model.js` — factories and validation

**Files:**
- Create: `src/lib/model.js`
- Test: `test/model.test.js`

**Interfaces:**
- Produces:
  - `newId(): string`
  - `makeItem(fields?: {text?, url?, note?, pageUrl?, order?}, opts?: {id?, now?}): Item`
  - `makeList(name: string, opts?: {id?, now?}): List` — `{ id, name, collapsed:false, order:0, items:[] }`
  - `makeDomainBucket(domain: string): Bucket` — `{ domain, widgetEnabled:true, lists:[] }`
  - `defaultMeta(): { schemaVersion:1, settings:{} }`
  - `SCHEMA_VERSION: 1`
  - `validateBucket(obj): boolean` — true if shape is valid.
  - `nextOrder(arr: {order:number}[]): number` — `max(order)+1`, or 0 if empty.
- `Item` shape: `{ id, text, done:false, url:null, note:null, pageUrl:null, createdAt, updatedAt, order }`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, defaultMeta, validateBucket, nextOrder, SCHEMA_VERSION } from "../src/lib/model.js";

const opts = { id: "fixed-id", now: 1000 };

test("makeItem fills defaults and respects injected id/now", () => {
  const it = makeItem({ text: "hi" }, opts);
  assert.deepEqual(it, {
    id: "fixed-id", text: "hi", done: false, url: null, note: null,
    pageUrl: null, createdAt: 1000, updatedAt: 1000, order: 0,
  });
});

test("makeItem keeps provided url/note/pageUrl/order", () => {
  const it = makeItem({ text: "x", url: "https://a.com", note: "n", pageUrl: "https://a.com/p", order: 5 }, opts);
  assert.equal(it.url, "https://a.com");
  assert.equal(it.note, "n");
  assert.equal(it.pageUrl, "https://a.com/p");
  assert.equal(it.order, 5);
});

test("makeList and makeDomainBucket shapes", () => {
  assert.deepEqual(makeList("Todo", opts), { id: "fixed-id", name: "Todo", collapsed: false, order: 0, items: [] });
  assert.deepEqual(makeDomainBucket("a.com"), { domain: "a.com", widgetEnabled: true, lists: [] });
});

test("defaultMeta", () => {
  assert.deepEqual(defaultMeta(), { schemaVersion: SCHEMA_VERSION, settings: {} });
});

test("nextOrder", () => {
  assert.equal(nextOrder([]), 0);
  assert.equal(nextOrder([{ order: 0 }, { order: 3 }, { order: 1 }]), 4);
});

test("validateBucket accepts a valid bucket and rejects junk", () => {
  assert.equal(validateBucket(makeDomainBucket("a.com")), true);
  const withItems = makeDomainBucket("a.com");
  withItems.lists.push(makeList("L", opts));
  withItems.lists[0].items.push(makeItem({ text: "t" }, opts));
  assert.equal(validateBucket(withItems), true);
  assert.equal(validateBucket(null), false);
  assert.equal(validateBucket({ domain: "a.com" }), false);
  assert.equal(validateBucket({ domain: "a.com", widgetEnabled: true, lists: "no" }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model.test.js`
Expected: FAIL — cannot find module `../src/lib/model.js`.

- [ ] **Step 3: Implement `src/lib/model.js`**

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model.js test/model.test.js
git commit -m "feat: add data model factories and bucket validation"
```

---

### Task 4: `src/lib/model.js` — counts, export, import/merge

**Files:**
- Modify: `src/lib/model.js`
- Test: `test/model-merge.test.js`

**Interfaces:**
- Produces (added to `model.js`):
  - `countOpenItems(bucket, { pageUrl }): number` — items where `!done && (item.pageUrl === null || item.pageUrl === pageUrl)`. Returns 0 for null/undefined bucket.
  - `serializeStore({ domains, settings }): object` — `{ schemaVersion, domains, settings }` (an `exportedAt` is added by the caller, not here, to keep this pure).
  - `parseBackup(jsonString): { schemaVersion, domains, settings }` — throws `Error` on invalid JSON, wrong/missing `schemaVersion`, or any invalid bucket.
  - `mergeStores(current: {domainKey: bucket}, incoming: {domainKey: bucket}): {domainKey: bucket}` — union; see rules below.

**Merge rules (deterministic):**
- Domain present only in one side → taken as-is.
- Domain in both → `widgetEnabled` taken from `current`. Lists merged by `id`: list only in one side is kept; list in both keeps `current.name`/`collapsed`/`order`, and its items are merged by `id` — item in both keeps the one with the greater `updatedAt` (ties → `current`); item in one side is kept. New list ids from incoming are appended.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, countOpenItems, serializeStore, parseBackup, mergeStores, SCHEMA_VERSION } from "../src/lib/model.js";

test("countOpenItems counts domain-level + current-page pins only", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [
    makeItem({ text: "open domain" }, { id: "1", now: 1 }),
    { ...makeItem({ text: "done" }, { id: "2", now: 1 }), done: true },
    makeItem({ text: "pin here", pageUrl: "https://a.com/p" }, { id: "3", now: 1 }),
    makeItem({ text: "pin elsewhere", pageUrl: "https://a.com/other" }, { id: "4", now: 1 }),
  ];
  b.lists.push(l);
  assert.equal(countOpenItems(b, { pageUrl: "https://a.com/p" }), 2);
  assert.equal(countOpenItems(b, { pageUrl: "https://a.com/none" }), 1);
  assert.equal(countOpenItems(null, { pageUrl: "x" }), 0);
});

test("serializeStore shape", () => {
  const out = serializeStore({ domains: { "d:a.com": makeDomainBucket("a.com") }, settings: { foo: 1 } });
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(out.settings, { foo: 1 });
  assert.ok(out.domains["d:a.com"]);
});

test("parseBackup round-trips and rejects bad input", () => {
  const json = JSON.stringify(serializeStore({ domains: { "d:a.com": makeDomainBucket("a.com") }, settings: {} }));
  const parsed = parseBackup(json);
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.throws(() => parseBackup("{ not json"));
  assert.throws(() => parseBackup(JSON.stringify({ schemaVersion: 999, domains: {} })));
  assert.throws(() => parseBackup(JSON.stringify({ schemaVersion: SCHEMA_VERSION, domains: { "d:a.com": { bad: true } } })));
});

test("mergeStores unions and resolves item conflicts by updatedAt", () => {
  const cur = { "d:a.com": makeDomainBucket("a.com") };
  cur["d:a.com"].lists = [makeList("L", { id: "l1" })];
  cur["d:a.com"].lists[0].items = [{ ...makeItem({ text: "old" }, { id: "i1", now: 1 }), updatedAt: 1 }];

  const inc = { "d:a.com": makeDomainBucket("a.com"), "d:b.com": makeDomainBucket("b.com") };
  inc["d:a.com"].lists = [makeList("L", { id: "l1" })];
  inc["d:a.com"].lists[0].items = [
    { ...makeItem({ text: "new" }, { id: "i1", now: 2 }), updatedAt: 2 },
    makeItem({ text: "added" }, { id: "i2", now: 2 }),
  ];

  const merged = mergeStores(cur, inc);
  assert.ok(merged["d:b.com"]);
  const items = merged["d:a.com"].lists[0].items;
  assert.equal(items.find((x) => x.id === "i1").text, "new");
  assert.ok(items.find((x) => x.id === "i2"));
  assert.equal(items.length, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/model-merge.test.js`
Expected: FAIL — `countOpenItems` / `serializeStore` / `parseBackup` / `mergeStores` are not exported.

- [ ] **Step 3: Append to `src/lib/model.js`**

```js
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
      else curList.items = mergeItems(curList.items, incList.items);
    }
    out[key] = { ...cur, lists: [...listsById.values()] };
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/model-merge.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.js test/model-merge.test.js
git commit -m "feat: add open-item count, export, and import/merge to model"
```

---

### Task 5: `src/lib/storage.js` — chrome.storage access layer

**Files:**
- Create: `src/lib/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: `defaultMeta` from `model.js`.
- Produces:
  - `async getMeta(): meta` — returns stored meta or `defaultMeta()`.
  - `async setMeta(meta): void`
  - `async getDomain(key): bucket | null`
  - `async setDomain(key, bucket): void`
  - `async removeDomain(key): void`
  - `async getAllDomains(): { key: bucket }` — only `d:`-prefixed keys.
  - `subscribe(callback: (changes) => void): () => void` — listens to `chrome.storage.onChanged` for area `"local"`, returns an unsubscribe function.
- All functions reference `chrome.storage.local` only inside their bodies (so tests stub `globalThis.chrome` before calling).

- [ ] **Step 1: Write the failing test** (with an in-memory fake `chrome`)

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/storage.test.js`
Expected: FAIL — cannot find module `../src/lib/storage.js`.

- [ ] **Step 3: Implement `src/lib/storage.js`**

```js
import { defaultMeta } from "./model.js";

const META_KEY = "meta";
const DOMAIN_PREFIX = "d:";

export async function getMeta() {
  const out = await chrome.storage.local.get(META_KEY);
  return out[META_KEY] ?? defaultMeta();
}

export async function setMeta(meta) {
  await chrome.storage.local.set({ [META_KEY]: meta });
}

export async function getDomain(key) {
  const out = await chrome.storage.local.get(key);
  return out[key] ?? null;
}

export async function setDomain(key, bucket) {
  await chrome.storage.local.set({ [key]: bucket });
}

export async function removeDomain(key) {
  await chrome.storage.local.remove(key);
}

export async function getAllDomains() {
  const all = await chrome.storage.local.get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith(DOMAIN_PREFIX)) out[k] = v;
  return out;
}

export function subscribe(callback) {
  const handler = (changes, area) => {
    if (area === "local") callback(changes);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/storage.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.js test/storage.test.js
git commit -m "feat: add chrome.storage access layer with onChanged subscribe"
```

---

### Task 6: `src/background.js` — toolbar badge

**Files:**
- Create: `src/background.js`

**Interfaces:**
- Consumes: `resolveScope` (scope.js), `countOpenItems` (model.js), `getDomain` (storage.js).
- Produces: badge behavior only; no exports.

- [ ] **Step 1: Implement `src/background.js`**

```js
import { resolveScope } from "./lib/scope.js";
import { countOpenItems } from "./lib/model.js";
import { getDomain } from "./lib/storage.js";

async function updateBadgeForTab(tab) {
  if (!tab || !tab.url) return;
  const scope = resolveScope(tab.url);
  if (scope.kind !== "web") {
    await chrome.action.setBadgeText({ text: "", tabId: tab.id });
    return;
  }
  const bucket = await getDomain(scope.key);
  const count = countOpenItems(bucket, { pageUrl: scope.pageUrl });
  await chrome.action.setBadgeText({ text: count ? String(count) : "", tabId: tab.id });
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await updateBadgeForTab(tab);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await updateBadgeForTab(tab);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" || info.url) updateBadgeForTab(tab);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") refreshActiveTab();
});
```

- [ ] **Step 2: Reload the extension and verify the badge**

Manual: in `chrome://extensions`, click reload on Web Notes. Open `https://github.com`. The badge is empty (no data yet). Keep this tab; the next task's popup will add items and the badge should then show a count.

- [ ] **Step 3: Verify the service worker has no errors**

Manual: on the extension card, click "service worker" to open its console. Expected: no red errors on load.

- [ ] **Step 4: Commit**

```bash
git add src/background.js
git commit -m "feat: add background service worker that maintains the toolbar badge"
```

---

### Task 7: Popup

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`

**Interfaces:**
- Consumes: `resolveScope` (scope.js); `makeDomainBucket`, `makeList`, `makeItem`, `nextOrder` (model.js); `getDomain`, `setDomain`, `subscribe` (storage.js).
- Produces: the popup UI. No exports.

- [ ] **Step 1: Create `src/popup/popup.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header>
      <span id="domain" class="domain"></span>
      <button id="see-all" class="link" title="Open full app">⤢ all</button>
    </header>
    <main id="lists"></main>
    <section id="page-section" hidden>
      <h2 id="page-heading">★ This page</h2>
      <div id="page-items"></div>
    </section>
    <footer>
      <button id="new-list" class="link">+ new list</button>
      <label class="widget-toggle"><input type="checkbox" id="widget-toggle" /> widget</label>
    </footer>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/popup/popup.css`**

```css
:root { --indigo: #4f46e5; --line: #e5e7eb; --muted: #6b7280; }
* { box-sizing: border-box; }
body { width: 340px; margin: 0; font: 13px/1.4 system-ui, sans-serif; color: #111; max-height: 560px; overflow-y: auto; }
header, footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--line); }
footer { border-bottom: none; border-top: 1px solid var(--line); position: sticky; bottom: 0; background: #fff; }
.domain { font-weight: 600; }
.link { background: none; border: none; color: var(--indigo); cursor: pointer; font-size: 12px; }
.list { padding: 6px 10px; border-bottom: 1px solid var(--line); }
.list-head { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.list-head .name { font-weight: 600; flex: 1; }
.list-head .count { color: var(--muted); font-size: 11px; }
.list-head .del { color: var(--muted); }
.item { display: flex; align-items: center; gap: 6px; padding: 3px 0 3px 4px; }
.item input[type="checkbox"] { margin: 0; }
.item .text { flex: 1; }
.item.done .text { text-decoration: line-through; color: var(--muted); }
.item a { text-decoration: none; }
.add-row { display: flex; gap: 4px; padding: 4px 0; }
.add-row input[type="text"] { flex: 1; padding: 3px 5px; border: 1px solid var(--line); border-radius: 4px; }
.add-row .pin { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 3px; }
.empty { padding: 16px 10px; color: var(--muted); text-align: center; }
h2 { font-size: 12px; margin: 8px 10px 2px; color: var(--muted); }
button.del { background: none; border: none; cursor: pointer; }
```

- [ ] **Step 3: Create `src/popup/popup.js`**

```js
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
      if (!bucket.lists.length) { await save(); return; }
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
```

- [ ] **Step 4: Reload and verify the popup**

Manual: reload the extension. On `https://github.com`, click the toolbar icon. Click "+ new list", name it "Bugs". Add an item "review PR". Check it off and back on. Add an item with "this page" ticked → it appears under "★ This page". Expected: items persist after closing/reopening the popup; the toolbar badge shows the open count.

- [ ] **Step 5: Verify cross-surface sync foundation**

Manual: open the popup, then open `chrome://extensions` → Web Notes → "service worker" console, run `chrome.storage.local.get(null).then(console.log)`. Expected: a `d:github.com` bucket with your list/items.

- [ ] **Step 6: Commit**

```bash
git add src/popup/
git commit -m "feat: add popup UI for per-domain lists and items"
```

---

### Task 8: Floating widget (content script)

**Files:**
- Create: `src/content/widget.js`
- Create: `src/content/widget.css`

**Interfaces:**
- Consumes (via dynamic import of web-accessible modules): `resolveScope` (scope.js); `makeItem`, `nextOrder`, `countOpenItems` (model.js); `getDomain`, `setDomain`, `subscribe` (storage.js).
- Produces: an on-page shadow-DOM widget. No exports.

- [ ] **Step 1: Create `src/content/widget.css`**

```css
.host { position: fixed; z-index: 2147483647; }
.bubble { display: flex; align-items: center; gap: 4px; background: #4f46e5; color: #fff; border-radius: 18px; padding: 6px 10px; font: 12px system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); user-select: none; }
.panel { width: 260px; max-height: 320px; overflow-y: auto; background: #fff; color: #111; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.3); font: 13px system-ui, sans-serif; }
.panel header { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; }
.panel .close { cursor: pointer; border: none; background: none; font-size: 14px; }
.row { display: flex; align-items: center; gap: 6px; padding: 4px 10px; }
.row .t { flex: 1; }
.row.done .t { text-decoration: line-through; color: #6b7280; }
.add { width: 100%; border: none; border-top: 1px solid #e5e7eb; padding: 8px 10px; font: inherit; }
.add:focus { outline: 2px solid #4f46e5; outline-offset: -2px; }
.more { display: block; text-align: center; padding: 6px; color: #4f46e5; cursor: pointer; border-top: 1px solid #e5e7eb; }
```

- [ ] **Step 2: Create `src/content/widget.js`**

```js
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
```

- [ ] **Step 3: Add the `open-app` message handler to `src/background.js`**

Modify `src/background.js` — append:

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-app") chrome.tabs.create({ url: chrome.runtime.getURL("src/app/app.html") });
});
```

- [ ] **Step 4: Reload and verify the widget**

Manual: reload the extension, then reload `https://github.com`. With at least one open item for that domain, a `📝 N` bubble appears bottom-right. Click → panel expands listing open items. Check one off → it disappears and the badge/count drop. Drag the bubble to another corner → it stays there. Click ✕ → widget disappears; re-enable via the popup's "widget" checkbox and reload the page → it returns.

- [ ] **Step 5: Verify isolation**

Manual: confirm on a CSS-heavy site (e.g. a news site) the widget looks correct (shadow DOM isolates styles) and the page layout is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/content/ src/background.js
git commit -m "feat: add on-page floating widget (shadow DOM content script)"
```

---

### Task 9: Full-page app — read, tree, filter, search

**Files:**
- Create: `src/app/app.html`
- Create: `src/app/app.css`
- Create: `src/app/app.js`

**Interfaces:**
- Consumes: `getAllDomains`, `subscribe` (storage.js). (Edit/export functions are added in Task 10.)
- Produces: the full-page app's read view. `render()` and module-level `state` are reused/extended by Task 10.

- [ ] **Step 1: Create `src/app/app.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Web Notes</title>
    <link rel="stylesheet" href="app.css" />
  </head>
  <body>
    <header>
      <h1>Web Notes</h1>
      <input id="search" type="search" placeholder="Search all notes…" />
      <label><input type="checkbox" id="hide-done" /> hide completed</label>
      <span class="spacer"></span>
      <button id="export" class="btn">⬆ Export</button>
      <button id="import" class="btn">⬇ Import</button>
      <input id="import-file" type="file" accept="application/json" hidden />
    </header>
    <div class="layout">
      <nav id="rail"></nav>
      <main id="tree"></main>
    </div>
    <script type="module" src="app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/app/app.css`**

```css
:root { --indigo: #4f46e5; --line: #e5e7eb; --muted: #6b7280; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #111; }
header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: #fff; z-index: 1; }
header h1 { font-size: 16px; margin: 0; color: var(--indigo); }
header .spacer { flex: 1; }
#search { padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; width: 280px; }
.btn { padding: 6px 10px; border: 1px solid var(--line); background: #fff; border-radius: 6px; cursor: pointer; }
.layout { display: flex; align-items: flex-start; }
#rail { width: 220px; border-right: 1px solid var(--line); padding: 10px; position: sticky; top: 53px; }
#rail .dom { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 6px; cursor: pointer; }
#rail .dom:hover { background: #f3f4f6; }
#rail .dom.active { background: #eef2ff; color: var(--indigo); font-weight: 600; }
#rail .count { margin-left: auto; color: var(--muted); font-size: 12px; }
#tree { flex: 1; padding: 16px 24px; }
.domain-block { margin-bottom: 22px; }
.domain-block > h2 { font-size: 15px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
.list-block { margin: 10px 0 10px 8px; }
.list-block > h3 { font-size: 13px; margin: 6px 0; display: flex; gap: 8px; align-items: center; }
.list-block .count { color: var(--muted); font-weight: 400; font-size: 12px; }
.item { display: flex; align-items: center; gap: 8px; padding: 3px 0 3px 12px; }
.item.done .t { text-decoration: line-through; color: var(--muted); }
.item .t { flex: 1; }
.item .pin { font-size: 11px; color: var(--muted); }
.empty { color: var(--muted); padding: 40px; text-align: center; }
.dragging { opacity: .4; }
.drag-over { border-top: 2px solid var(--indigo); }
```

- [ ] **Step 3: Create `src/app/app.js`** (read view; Task 10 extends this file)

```js
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
```

> Note: Task 10 replaces the `renderItem` function body with an editable/draggable version and wires the export/import buttons. The `export { el, renderItem }` line at the bottom is removed in Task 10 (the functions become internal); it exists here only so this task's file is self-consistent.

- [ ] **Step 4: Reload and verify the read view**

Manual: reload the extension. From the popup click "⤢ all" (or open `src/app/app.html`). Expected: left rail lists "All" + each domain with open counts; main panel shows Domain → List → Items as a tree. Type in search → items filter live. Tick "hide completed" → done items vanish. Click a domain in the rail → only it shows; Cmd/Ctrl-click adds more domains to the selection.

- [ ] **Step 5: Commit**

```bash
git add src/app/
git commit -m "feat: add full-page app read view (tree, rail filter, search)"
```

---

### Task 10: Full-page app — edit, reorder, export/import

**Files:**
- Modify: `src/app/app.js`

**Interfaces:**
- Consumes: `setDomain`, `removeDomain`, `getAllDomains` (storage.js); `serializeStore`, `parseBackup`, `mergeStores` (model.js); existing `state`, `render`, `el` from Task 9.
- Produces: editing, drag-reorder, and JSON export/import in the full-page app.

- [ ] **Step 1: Update imports at the top of `src/app/app.js`**

Replace the first import line with:

```js
import { getAllDomains, setDomain, removeDomain, subscribe } from "../lib/storage.js";
import { serializeStore, parseBackup, mergeStores } from "../lib/model.js";
```

- [ ] **Step 2: Replace the `renderItem` function** with an editable, draggable version

```js
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
  if (item.url) row.append(el("a", { href: item.url, target: "_blank", textContent: "🔗" }));
  const del = el("button", { className: "btn", textContent: "✕" });
  del.onclick = async () => { list.items = list.items.filter((x) => x !== item); await setDomain(key, b); };
  row.append(del);

  row.ondragstart = (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ key, list: list.id, item: item.id })); row.classList.add("dragging"); };
  row.ondragend = () => row.classList.remove("dragging");
  row.ondragover = (e) => { e.preventDefault(); row.classList.add("drag-over"); };
  row.ondragleave = () => row.classList.remove("drag-over");
  row.ondrop = async (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    const src = JSON.parse(e.dataTransfer.getData("text/plain"));
    if (src.list !== list.id || src.key !== key) return; // reorder within a list only
    const arr = list.items;
    const from = arr.findIndex((x) => x.id === src.item);
    const to = arr.findIndex((x) => x.id === item.id);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    arr.forEach((x, i) => (x.order = i));
    await setDomain(key, b);
  };
  return row;
}
```

- [ ] **Step 3: Wire export/import buttons** — append to `src/app/app.js`

```js
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
```

- [ ] **Step 4: Remove the now-obsolete export line**

Delete the `export { el, renderItem };` line at the bottom of the file (added in Task 9). The `renderItem` defined here shadows the read-only one — ensure only this version remains by confirming the old read-only `renderItem` from Task 9 was replaced in Step 2, not duplicated.

- [ ] **Step 5: Run the full unit suite (no regressions in lib)**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Reload and verify editing, reorder, export/import**

Manual:
1. Reload the extension, open the app.
2. Double-click an item → edit text → Enter. Confirm it persists (reopen popup on that domain).
3. Check/uncheck items; delete an item with ✕.
4. Drag an item within a list to reorder; reload the page → order persists.
5. Click Export → a `web-notes-backup-YYYY-MM-DD.json` downloads.
6. Delete a list's items in the popup, then Import that file → choose Cancel (merge) → items return.
7. Import a deliberately broken file (edit the JSON to remove `schemaVersion`) → expect an "Import failed" alert and no data change.

- [ ] **Step 7: Commit**

```bash
git add src/app/app.js
git commit -m "feat: add editing, drag-reorder, and export/import to full-page app"
```

---

## Self-Review

**Spec coverage:**
- Named lists per domain → Tasks 3, 7, 9. ✓
- Item shape (text/done/url/note/pageUrl) → Task 3. ✓ (Note: `note` field is stored and preserved through merge/validation; a dedicated note-editing UI is minimal in v1 — items are created with `note: null`. If richer note editing is desired it is a small popup/app addition; flagged here as the one intentionally thin spot.)
- Registrable-domain scope + page pin → Tasks 2, 7. ✓
- Vanilla, no build → Task 1 (package.json only runs tests). ✓
- Badge + floating widget → Tasks 6, 8. ✓
- chrome.storage.local + unlimitedStorage + onChanged sync → Tasks 1, 5; subscribe used in 6/7/8/9. ✓
- Popup, widget, full-page app → Tasks 7, 8, 9/10. ✓
- Export/import merge|replace with validation → Tasks 4, 10. ✓
- Edge cases (non-web pages, IP/localhost, delete confirm, last-list removal) → Tasks 2, 7. ✓
- Drag-reorder full-app only → Task 10. ✓
- Hide-completed filter, persist completed → Tasks 9, 10. ✓
- Testing strategy (Node unit tests for lib) → Tasks 2–5. ✓

**Type consistency:** `resolveScope` returns `{kind,key,domain,hostname,pageUrl}` and is consumed consistently (Tasks 6/7/8). `getDomain/setDomain/removeDomain/getAllDomains/subscribe` signatures match across consumers. `countOpenItems(bucket,{pageUrl})` used identically in Tasks 6/8. `makeItem`/`makeList`/`nextOrder` signatures match call sites. ✓

**Known thin spot (intentional, in-scope-minimal):** the `note` (long detail) field is persisted and round-trips through export/merge, but v1 UI creates items with `note: null` and does not expose a note editor beyond item text. This matches the spec's data model while keeping v1 UI lean; promoting it to a full editor is a small follow-up.

**Decision recorded:** drag-reorder is restricted to *within a single list* (cross-list move is out of scope for v1) to keep the drop logic simple and predictable.
