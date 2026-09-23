import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(scriptDir);
const dataDir = path.join(path.dirname(repoDir), "outputs", "20260922-national-uniform-shops");
const source = JSON.parse(fs.readFileSync(path.join(dataDir, "uniform_shop_prospects.json"), "utf8"));
const officialWeb = JSON.parse(fs.readFileSync(path.join(dataDir, "official-web-enrichment.json"), "utf8")).entries;
const outputPath = path.join(dataDir, "social-link-enrichment.json");
const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : { entries: {} };

function verifiedWeb(record) {
  if (record.official_web) return record.official_web;
  const entry = officialWeb[record.store_id];
  if (!entry?.url || entry.destinationError || entry.destinationStatus < 200 || entry.destinationStatus >= 400) return "";
  return entry.destinationUrl || entry.url;
}

function accountLink(raw, pageUrl) {
  let url;
  try { url = new URL(raw.replaceAll("&amp;", "&"), pageUrl); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let pathname;
  try { pathname = decodeURIComponent(url.pathname).replace(/\/+$/, ""); } catch { return null; }
  const parts = pathname.split("/").filter(Boolean);
  let platform = "";
  if (host === "instagram.com" && parts.length === 1 && !["p", "reel", "stories", "explore", "accounts", "direct"].includes(parts[0].toLowerCase())) platform = "Instagram";
  else if ((host === "lin.ee" && parts.length >= 1) || (host === "page.line.me" && parts.length >= 1) || (host === "line.me" && /^\/(?:R\/)?ti\/p\//i.test(pathname))) platform = "LINE";
  else if (host === "facebook.com" && parts.length >= 1 && !["sharer.php", "share.php", "share", "dialog", "plugins", "login", "watch", "reel", "groups", "events", "search", "hashtag", "facebookjapan", "&"].includes(parts[0].toLowerCase()) && (parts[0].toLowerCase() !== "profile.php" || url.searchParams.has("id"))) platform = "Facebook";
  else if (["x.com", "twitter.com"].includes(host) && parts.length === 1 && !["intent", "share", "home", "search", "i", "hashtag"].includes(parts[0].toLowerCase())) platform = "X";
  else if (host === "tiktok.com" && parts.length === 1 && parts[0].startsWith("@")) platform = "TikTok";
  else if (["youtube.com", "m.youtube.com"].includes(host) && parts.length >= 1 && (parts[0].startsWith("@") || ["channel", "user", "c"].includes(parts[0].toLowerCase()))) platform = "YouTube";
  if (!platform) return null;
  if (platform === "Facebook" && parts[0].toLowerCase() === "profile.php") url.search = `?id=${encodeURIComponent(url.searchParams.get("id"))}`;
  else url.search = "";
  url.hash = "";
  return { platform, url: url.toString() };
}

function linksFromHtml(html, pageUrl) {
  const links = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)) {
    const link = accountLink(match[1] || match[2] || match[3] || "", pageUrl);
    if (!link || seen.has(`${link.platform}:${link.url}`)) continue;
    seen.add(`${link.platform}:${link.url}`);
    links.push(link);
  }
  return links;
}

const urls = [...new Set(source.records.map(verifiedWeb).filter(Boolean))];
const pending = urls.filter((url) => process.argv.includes("--refresh") || !previous.entries[url]);
const entries = { ...previous.entries };
let next = 0;
const concurrency = 16;

async function worker() {
  while (next < pending.length) {
    const url = pending[next++];
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4500),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BANTEXProspectResearch/1.0)" }
      });
      const html = (await response.text()).slice(0, 2_000_000);
      entries[url] = {
        checkedAt, status: response.ok ? "checked" : "fetch_failed",
        httpStatus: response.status, finalUrl: response.url,
        links: response.ok ? linksFromHtml(html, response.url) : []
      };
    } catch (error) {
      entries[url] = { checkedAt, status: "fetch_failed", error: error.name, links: [] };
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
const result = { generatedAt: new Date().toISOString(), method: "Direct account links found in official website HTML anchors; absence does not prove no SNS account", entries };
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
const counts = { sites: urls.length, checked: 0, linked: 0, failed: 0, links: 0 };
for (const url of urls) {
  const entry = entries[url];
  if (entry?.status === "checked") counts.checked++;
  if (entry?.links?.length) { counts.linked++; counts.links += entry.links.length; }
  if (entry?.status === "fetch_failed") counts.failed++;
}
console.log(JSON.stringify({ outputPath, counts }, null, 2));
