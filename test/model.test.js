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
