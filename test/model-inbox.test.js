import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDomainBucket, makeList, makeItem, addToInbox, INBOX_NAME } from "../src/lib/model.js";

test("addToInbox creates the Inbox list when absent and appends the item", () => {
  const b = makeDomainBucket("a.com");
  const out = addToInbox(b, { text: "grabbed", url: "https://a.com/x" }, { id: "i1", now: 5 });
  const inbox = out.lists.find((l) => l.name === INBOX_NAME);
  assert.ok(inbox, "inbox created");
  assert.equal(inbox.items.length, 1);
  assert.equal(inbox.items[0].id, "i1");
  assert.equal(inbox.items[0].text, "grabbed");
  assert.equal(inbox.items[0].url, "https://a.com/x");
  assert.equal(inbox.items[0].pageUrl, null);
  assert.equal(inbox.items[0].order, 0);
});

test("addToInbox appends to an existing Inbox and assigns order via nextOrder", () => {
  const b = makeDomainBucket("a.com");
  const inbox = makeList(INBOX_NAME, { id: "inbox" });
  inbox.items = [{ ...makeItem({ text: "old" }, { id: "old", now: 1 }), order: 0 }];
  b.lists = [inbox];
  const out = addToInbox(b, { text: "new" }, { id: "i2", now: 6 });
  const outInbox = out.lists.find((l) => l.id === "inbox");
  assert.deepEqual(outInbox.items.map((i) => i.id), ["old", "i2"]);
  assert.equal(outInbox.items[1].order, 1);
});

test("addToInbox does not create a second Inbox and keeps other lists", () => {
  const b = makeDomainBucket("a.com");
  b.lists = [makeList("Bugs", { id: "bugs" }), makeList(INBOX_NAME, { id: "inbox" })];
  const out = addToInbox(b, { text: "x" }, { id: "i3", now: 7 });
  assert.equal(out.lists.filter((l) => l.name === INBOX_NAME).length, 1);
  assert.equal(out.lists.length, 2);
});

test("addToInbox is non-mutating", () => {
  const b = makeDomainBucket("a.com");
  b.lists = [makeList(INBOX_NAME, { id: "inbox" })];
  const snap = JSON.parse(JSON.stringify(b));
  addToInbox(b, { text: "x" }, { id: "i4", now: 8 });
  assert.deepEqual(b, snap);
});
