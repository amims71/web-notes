import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, moveItem, reorderLists } from "../src/lib/model.js";

function bucketWithTwoLists() {
  const b = makeDomainBucket("a.com");
  const l1 = makeList("L1", { id: "l1" });
  l1.items = [
    { ...makeItem({ text: "a" }, { id: "a", now: 1 }), order: 0 },
    { ...makeItem({ text: "b" }, { id: "b", now: 1 }), order: 1 },
    { ...makeItem({ text: "c" }, { id: "c", now: 1 }), order: 2 },
  ];
  const l2 = makeList("L2", { id: "l2" });
  l2.items = [{ ...makeItem({ text: "d" }, { id: "d", now: 1 }), order: 0 }];
  b.lists = [l1, l2];
  return b;
}

test("moveItem reorders within a list and reassigns order", () => {
  const b = bucketWithTwoLists();
  const out = moveItem(b, "l1", "l1", "c", 0);
  const ids = out.lists[0].items.map((i) => i.id);
  assert.deepEqual(ids, ["c", "a", "b"]);
  assert.deepEqual(out.lists[0].items.map((i) => i.order), [0, 1, 2]);
});

test("moveItem moves an item to another list at an index", () => {
  const b = bucketWithTwoLists();
  const out = moveItem(b, "l1", "l2", "b", 0);
  assert.deepEqual(out.lists[0].items.map((i) => i.id), ["a", "c"]);
  assert.deepEqual(out.lists[1].items.map((i) => i.id), ["b", "d"]);
  assert.deepEqual(out.lists[0].items.map((i) => i.order), [0, 1]);
  assert.deepEqual(out.lists[1].items.map((i) => i.order), [0, 1]);
});

test("moveItem clamps a large toIndex to append", () => {
  const b = bucketWithTwoLists();
  const out = moveItem(b, "l1", "l2", "a", 99);
  assert.deepEqual(out.lists[1].items.map((i) => i.id), ["d", "a"]);
});

test("moveItem is a no-op on missing ids and does not mutate input", () => {
  const b = bucketWithTwoLists();
  const snap = JSON.parse(JSON.stringify(b));
  assert.equal(moveItem(b, "nope", "l2", "a", 0), b);
  assert.equal(moveItem(b, "l1", "l2", "nope", 0), b);
  moveItem(b, "l1", "l2", "b", 0);
  assert.deepEqual(b, snap);
});

test("reorderLists reorders and reassigns order, leftovers kept at end", () => {
  const b = bucketWithTwoLists();
  const out = reorderLists(b, ["l2", "l1"]);
  assert.deepEqual(out.lists.map((l) => l.id), ["l2", "l1"]);
  assert.deepEqual(out.lists.map((l) => l.order), [0, 1]);
  const out2 = reorderLists(b, ["l2"]); // l1 not listed -> kept at end
  assert.deepEqual(out2.lists.map((l) => l.id), ["l2", "l1"]);
});

test("reorderLists does not mutate input", () => {
  const b = bucketWithTwoLists();
  const snap = JSON.parse(JSON.stringify(b));
  reorderLists(b, ["l2", "l1"]);
  assert.deepEqual(b, snap);
});
