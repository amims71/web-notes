import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeDomainBucket, makeList, validateBucket } from "../src/lib/model.js";

test("makeItem defaults due/remindLead/repeat to null and keeps provided values", () => {
  const d = makeItem({ text: "x" }, { id: "i", now: 1 });
  assert.equal(d.due, null);
  assert.equal(d.remindLead, null);
  assert.equal(d.repeat, null);
  const e = makeItem({ text: "y", due: 1000, remindLead: 30, repeat: "daily" }, { id: "j", now: 1 });
  assert.equal(e.due, 1000);
  assert.equal(e.remindLead, 30);
  assert.equal(e.repeat, "daily");
});

test("validateBucket accepts items missing the new fields (old backups)", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items.push({ id: "i1", text: "t", done: false, url: null, note: null, pageUrl: null, createdAt: 1, updatedAt: 1, order: 0 });
  b.lists.push(l);
  assert.equal(validateBucket(b), true);
});

test("validateBucket accepts valid new fields and rejects wrong types", () => {
  const ok = makeDomainBucket("a.com");
  const lo = makeList("L", { id: "l1" });
  lo.items.push(makeItem({ text: "t", due: 1000, remindLead: 5, repeat: "weekly" }, { id: "i1", now: 1 }));
  ok.lists.push(lo);
  assert.equal(validateBucket(ok), true);

  const mk = (over) => {
    const b = makeDomainBucket("a.com");
    const l = makeList("L", { id: "l1" });
    l.items.push({ ...makeItem({ text: "t" }, { id: "i1", now: 1 }), ...over });
    b.lists.push(l);
    return b;
  };
  assert.equal(validateBucket(mk({ due: "soon" })), false);
  assert.equal(validateBucket(mk({ remindLead: "5" })), false);
  assert.equal(validateBucket(mk({ repeat: 7 })), false);
});
