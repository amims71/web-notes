// Second-level public suffixes where the registrable domain needs three labels.
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.nz", "org.nz", "govt.nz", "ac.nz",
  "co.in", "net.in", "org.in", "gen.in", "firm.in",
  "co.za", "org.za", "net.za",
  "com.br", "net.br", "org.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "com.mx", "com.tr", "com.sg", "com.hk", "com.tw", "com.ar", "com.pl",
  "co.kr", "or.kr", "co.id", "co.th", "com.ua",
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function registrableDomain(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, "");
  if (!host) return host;
  if (host.includes(":") || IPV4.test(host)) return host; // IPv6/IPv4 literal
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

export function canonicalPageUrl(urlString) {
  const u = new URL(urlString);
  return u.origin + u.pathname + u.search;
}

export function resolveScope(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return { kind: "none" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { kind: "none" };
  const domain = registrableDomain(u.hostname);
  return {
    kind: "web",
    key: "d:" + domain,
    domain,
    hostname: u.hostname,
    pageUrl: canonicalPageUrl(urlString),
  };
}
