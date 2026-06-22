import { resolveScope } from "./lib/scope.js";
import { countOpenItems } from "./lib/model.js";
import { getDomain } from "./lib/storage.js";

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
