import { test } from "node:test";
import assert from "node:assert/strict";
import { registrableDomain, canonicalPageUrl, resolveScope } from "../src/lib/scope.js";

test("registrableDomain collapses subdomains", () => {
  assert.equal(registrableDomain("app.github.com"), "github.com");
  assert.equal(registrableDomain("gist.github.com"), "github.com");
  assert.equal(registrableDomain("github.com"), "github.com");
});

test("registrableDomain handles multi-part TLDs", () => {
  assert.equal(registrableDomain("foo.bar.co.uk"), "bar.co.uk");
  assert.equal(registrableDomain("shop.example.com.au"), "example.com.au");
});

test("registrableDomain returns single-label and IP hosts as-is", () => {
  assert.equal(registrableDomain("localhost"), "localhost");
  assert.equal(registrableDomain("192.168.1.4"), "192.168.1.4");
});

test("canonicalPageUrl drops the hash", () => {
  assert.equal(canonicalPageUrl("https://a.com/x?y=1#frag"), "https://a.com/x?y=1");
});

test("resolveScope maps web URLs to a domain key", () => {
  const s = resolveScope("https://app.github.com/issues#x");
  assert.deepEqual(s, {
    kind: "web",
    key: "d:github.com",
    domain: "github.com",
    hostname: "app.github.com",
    pageUrl: "https://app.github.com/issues",
  });
});

test("resolveScope returns none for non-web schemes", () => {
  assert.equal(resolveScope("chrome://extensions").kind, "none");
  assert.equal(resolveScope("about:blank").kind, "none");
  assert.equal(resolveScope("not a url").kind, "none");
});
