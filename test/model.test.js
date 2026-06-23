import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, defaultMeta, validateBucket, nextOrder, SCHEMA_VERSION, isHttpUrl } from "../src/lib/model.js";

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

test("isHttpUrl accepts http/https and rejects everything else", () => {
  assert.equal(isHttpUrl("https://a.com"), true);
  assert.equal(isHttpUrl("http://a.com/x"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("ftp://a.com"), false);
  assert.equal(isHttpUrl(null), false);
  assert.equal(isHttpUrl(""), false);
});

test("validateBucket rejects non-string pageUrl or url on items", () => {
  const bad = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items.push({ ...makeItem({ text: "t" }, { id: "i1", now: 1 }), pageUrl: 123 });
  bad.lists.push(l);
  assert.equal(validateBucket(bad), false);

  const bad2 = makeDomainBucket("a.com");
  const l2 = makeList("L", { id: "l2" });
  l2.items.push({ ...makeItem({ text: "t" }, { id: "i2", now: 1 }), url: 5 });
  bad2.lists.push(l2);
  assert.equal(validateBucket(bad2), false);
});

test("validateBucket rejects a non-string note on items", () => {
  const bad = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items.push({ ...makeItem({ text: "t" }, { id: "i1", now: 1 }), note: 123 });
  bad.lists.push(l);
  assert.equal(validateBucket(bad), false);
});
