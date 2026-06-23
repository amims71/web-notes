import { test } from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeList, makeDomainBucket, toMarkdown } from "../src/lib/model.js";

const mkItem = (over, id) => ({ ...makeItem({ text: over.text ?? id }, { id, now: 1 }), ...over });

test("toMarkdown renders domains/lists/items and excludes archived", () => {
  const b = makeDomainBucket("a.com");
  const l1 = makeList("Bugs", { id: "l1" }); l1.order = 0;
  l1.items = [
    mkItem({ text: "fix it", done: false, url: "https://a.com/x", due: 1000000000000, tags: ["urgent"], note: "asap", order: 0 }, "i1"),
    mkItem({ text: "done one", done: true, order: 1 }, "i2"),
    mkItem({ text: "hidden", archived: true, order: 2 }, "i3"),
  ];
  const l2 = makeList("Empty", { id: "l2" }); l2.order = 1;
  l2.items = [mkItem({ text: "x", archived: true }, "i4")];
  b.lists = [l1, l2];
  const md = toMarkdown({ "d:a.com": b });
  assert.equal(md, [
    "# a.com",
    "",
    "## Bugs",
    "",
    "- [ ] fix it [link](https://a.com/x) (due 2001-09-09T01:46Z) #urgent",
    "  note: asap",
    "- [x] done one",
    "",
  ].join("\n"));
});

test("toMarkdown returns empty string for empty or all-archived store", () => {
  assert.equal(toMarkdown({}), "");
  const b = makeDomainBucket("a.com");
  const l = makeList("L", { id: "l1" });
  l.items = [mkItem({ archived: true }, "i1")];
  b.lists = [l];
  assert.equal(toMarkdown({ "d:a.com": b }), "");
});
