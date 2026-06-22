import { defaultMeta } from "./model.js";

const META_KEY = "meta";
const DOMAIN_PREFIX = "d:";

export async function getMeta() {
  const out = await chrome.storage.local.get(META_KEY);
  return out[META_KEY] ?? defaultMeta();
}

export async function setMeta(meta) {
  await chrome.storage.local.set({ [META_KEY]: meta });
}

export async function getDomain(key) {
  const out = await chrome.storage.local.get(key);
  return out[key] ?? null;
}

export async function setDomain(key, bucket) {
  await chrome.storage.local.set({ [key]: bucket });
}

export async function removeDomain(key) {
  await chrome.storage.local.remove(key);
}

export async function getAllDomains() {
  const all = await chrome.storage.local.get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith(DOMAIN_PREFIX)) out[k] = v;
  return out;
}

export function subscribe(callback) {
  const handler = (changes, area) => {
    if (area === "local") callback(changes);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
