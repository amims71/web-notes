import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, reminderTime, nextOccurrence, dueState, sweepDue } from "../src/lib/model.js";

const DAY = 86400000, MIN = 60000;

test("reminderTime subtracts the lead, null when no due", () => {
  assert.equal(reminderTime(makeItem({ text: "x" }, { id: "a", now: 1 })), null);
  assert.equal(reminderTime(makeItem({ text: "x", due: 1000000 }, { id: "a", now: 1 })), 1000000);
  assert.equal(reminderTime(makeItem({ text: "x", due: 1000000, remindLead: 30 }, { id: "a", now: 1 })), 1000000 - 30 * MIN);
});

test("nextOccurrence rolls strictly past now (incl. multi-period catch-up)", () => {
  const base = 1000 * DAY;
  assert.equal(nextOccurrence(base, "daily", base), base + DAY);
  assert.equal(nextOccurrence(base, "daily", base + 3 * DAY + 5), base + 4 * DAY);
  assert.equal(nextOccurrence(base, "weekly", base + 1), base + 7 * DAY);
});

test("dueState reflects none/upcoming/overdue and suppresses done", () => {
  const now = 1000 * DAY;
  assert.equal(dueState(makeItem({ text: "x" }, { id: "a", now }), now), "none");
  assert.equal(dueState(makeItem({ text: "x", due: now + DAY }, { id: "a", now }), now), "upcoming");
  assert.equal(dueState(makeItem({ text: "x", due: now - DAY }, { id: "a", now }), now), "overdue");
  const done = { ...makeItem({ text: "x", due: now - DAY }, { id: "a", now }), done: true };
  assert.equal(dueState(done, now), "none");
});

test("sweepDue fires items whose reminder is in (lastCheck, now], ignoring done/out-of-window", () => {
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [
    makeItem({ text: "fire", due: 100 }, { id: "fire", now: 1 }),
    makeItem({ text: "future", due: 10000 }, { id: "future", now: 1 }),
    { ...makeItem({ text: "done", due: 100 }, { id: "done", now: 1 }), done: true },
  ];
  b.lists = [l];
  const { due, bucket } = sweepDue(b, 50, 200);
  assert.deepEqual(due.map((i) => i.id), ["fire"]);
  assert.equal(bucket, b); // nothing recurring → same reference
});

test("sweepDue rolls a recurring fired item forward without mutating input", () => {
  const now = 1000 * DAY;
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [makeItem({ text: "r", due: now - 10, repeat: "daily" }, { id: "r", now: 1 })];
  b.lists = [l];
  const snap = JSON.parse(JSON.stringify(b));
  const { due, bucket } = sweepDue(b, now - 1000, now);
  assert.deepEqual(due.map((i) => i.id), ["r"]);
  assert.notEqual(bucket, b);
  assert.equal(bucket.lists[0].items[0].due, nextOccurrence(now - 10, "daily", now));
  assert.deepEqual(b, snap); // input untouched
});
