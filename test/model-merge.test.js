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
