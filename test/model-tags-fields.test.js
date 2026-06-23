import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeDomainBucket, makeList, validateBucket } from "../src/lib/model.js";

test("makeItem defaults tags=[] and archived=false, keeps provided", () => {
  const d = makeItem({ text: "x" }, { id: "i", now: 1 });
  assert.deepEqual(d.tags, []);
  assert.equal(d.archived, false);
  const e = makeItem({ text: "y", tags: ["a", "b"], archived: true }, { id: "j", now: 1 });
  assert.deepEqual(e.tags, ["a", "b"]);
  assert.equal(e.archived, true);
});

test("validateBucket accepts items missing tags/archived (old backups)", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items.push({ id: "i1", text: "t", done: false, url: null, note: null, pageUrl: null, createdAt: 1, updatedAt: 1, order: 0 });
  b.lists.push(l);
  assert.equal(validateBucket(b), true);
});

test("validateBucket accepts valid tags/archived and rejects wrong types", () => {
  const ok = makeDomainBucket("a.com");
  const lo = makeList("L", { id: "l1" });
  lo.items.push(makeItem({ text: "t", tags: ["x"], archived: true }, { id: "i1", now: 1 }));
  ok.lists.push(lo);
  assert.equal(validateBucket(ok), true);

  const mk = (over) => {
    const b = makeDomainBucket("a.com");
    const l = makeList("L", { id: "l1" });
    l.items.push({ ...makeItem({ text: "t" }, { id: "i1", now: 1 }), ...over });
    b.lists.push(l);
    return b;
  };
  assert.equal(validateBucket(mk({ tags: "x" })), false);
  assert.equal(validateBucket(mk({ tags: [1, 2] })), false);
  assert.equal(validateBucket(mk({ archived: "yes" })), false);
});
