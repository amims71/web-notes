import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, sortItems, allTags, countOpenItems, sweepDue } from "../src/lib/model.js";

const mk = (over, id) => ({ ...makeItem({ text: over.text ?? id }, { id, now: 1 }), ...over });

test("sortItems manual/due/created/alpha, non-mutating", () => {
  const items = [
    mk({ order: 2, due: 300, createdAt: 10, text: "Banana" }, "a"),
    mk({ order: 0, due: null, createdAt: 30, text: "apple" }, "b"),
    mk({ order: 1, due: 100, createdAt: 20, text: "Cherry" }, "c"),
  ];
  const snap = JSON.parse(JSON.stringify(items));
  assert.deepEqual(sortItems(items, "manual").map((i) => i.id), ["b", "c", "a"]);
  assert.deepEqual(sortItems(items, "due").map((i) => i.id), ["c", "a", "b"]); // nulls last
  assert.deepEqual(sortItems(items, "created").map((i) => i.id), ["a", "c", "b"]);
  assert.deepEqual(sortItems(items, "alpha").map((i) => i.id), ["b", "a", "c"]); // apple,Banana,Cherry
  assert.deepEqual(items, snap); // non-mutating
});

test("allTags returns sorted unique tags across buckets", () => {
  const domains = {
    "d:a.com": (() => { const b = makeDomainBucket("a.com"); const l = makeList("L", { id: "l1" }); l.items = [mk({ tags: ["z", "a"] }, "1"), mk({ tags: ["a"] }, "2")]; b.lists = [l]; return b; })(),
    "d:b.com": (() => { const b = makeDomainBucket("b.com"); const l = makeList("L", { id: "l2" }); l.items = [mk({ tags: ["m"] }, "3")]; b.lists = [l]; return b; })(),
  };
  assert.deepEqual(allTags(domains), ["a", "m", "z"]);
});

test("countOpenItems excludes archived", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [mk({ done: false }, "1"), mk({ done: false, archived: true }, "2")];
  b.lists = [l];
  assert.equal(countOpenItems(b, { pageUrl: null }), 1);
});

test("sweepDue skips archived", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [mk({ due: 100, archived: true }, "1")];
  b.lists = [l];
  assert.deepEqual(sweepDue(b, 50, 200).due.map((i) => i.id), []);
});
