import { resolveScope } from "./lib/scope.js";
import { countOpenItems, addToInbox, makeDomainBucket, sweepDue, isHttpUrl } from "./lib/model.js";
import { getDomain, setDomain, getAllDomains, getMeta, setMeta } from "./lib/storage.js";

async function updateBadgeForTab(tab) {
  if (!tab || !tab.url) return;
  const scope = resolveScope(tab.url);
  if (scope.kind !== "web") {
    await chrome.action.setBadgeText({ text: "", tabId: tab.id });
    return;
  }
  const bucket = await getDomain(scope.key);
  const count = countOpenItems(bucket, { pageUrl: scope.pageUrl });
  await chrome.action.setBadgeText({ text: count ? String(count) : "", tabId: tab.id });
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await updateBadgeForTab(tab);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
  chrome.alarms.create("due-check", { periodInMinutes: 1 });
  const web = ["http://*/*", "https://*/*"];
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "capture-selection", title: "Add selection to Web Notes", contexts: ["selection"], documentUrlPatterns: web });
    chrome.contextMenus.create({ id: "capture-page", title: "Add this page to Web Notes", contexts: ["page"], documentUrlPatterns: web });
    chrome.contextMenus.create({ id: "capture-link", title: "Add link to Web Notes", contexts: ["link"], documentUrlPatterns: web });
  });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await updateBadgeForTab(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" || info.url) await updateBadgeForTab(tab);
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local") await refreshActiveTab();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-app") chrome.tabs.create({ url: chrome.runtime.getURL("src/app/app.html") });
});

async function captureToDomain(pageUrl, fields) {
  const scope = resolveScope(pageUrl);
  if (scope.kind !== "web" || !fields.text) return;
  const bucket = (await getDomain(scope.key)) ?? makeDomainBucket(scope.domain);
  await setDomain(scope.key, addToInbox(bucket, fields));
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const pageUrl = info.pageUrl ?? tab?.url;
  if (!pageUrl) return;
  let fields = null;
  if (info.menuItemId === "capture-selection" && info.selectionText) fields = { text: info.selectionText.trim(), url: pageUrl };
  else if (info.menuItemId === "capture-page") fields = { text: tab?.title || pageUrl, url: pageUrl };
  else if (info.menuItemId === "capture-link" && info.linkUrl) fields = { text: info.linkUrl, url: info.linkUrl };
  if (fields) await captureToDomain(pageUrl, fields);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  await captureToDomain(tab.url, { text: tab.title || tab.url, url: tab.url });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("due-check", { periodInMinutes: 1 });
});

function notifyDue(item, domain) {
  const id = isHttpUrl(item.url) ? item.url : "webnotes:app:" + item.id;
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: (item.text || "Reminder").slice(0, 80),
    message: domain,
  });
}

async function runDueSweep() {
  const meta = await getMeta();
  meta.settings = meta.settings ?? {};
  const now = Date.now();
  const lastCheck = meta.settings.lastDueCheck;
  if (lastCheck == null) {
    meta.settings.lastDueCheck = now;
    await setMeta(meta);
    return;
  }
  const domains = await getAllDomains();
  for (const [key, bucket] of Object.entries(domains)) {
    const { due, bucket: next } = sweepDue(bucket, lastCheck, now);
    for (const item of due) notifyDue(item, bucket.domain);
    if (next !== bucket) await setDomain(key, next);
  }
  meta.settings.lastDueCheck = now;
  await setMeta(meta);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "due-check") await runDueSweep();
});

chrome.notifications.onClicked.addListener((id) => {
  const url = id.startsWith("http") ? id : chrome.runtime.getURL("src/app/app.html");
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});
