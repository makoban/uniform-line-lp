import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(scriptDir);
const projectDir = path.dirname(repoDir);
const sourcePath = path.join(projectDir, "outputs", "20260922-national-uniform-shops", "uniform_shop_prospects.json");
const outputPath = path.join(projectDir, "outputs", "20260922-national-uniform-shops", "official-web-enrichment.json");
const priorityArg = process.argv.find((argument) => argument.startsWith("--priority="));
const targetPriority = priorityArg ? priorityArg.split("=")[1] : "A";
const shouldValidate = process.argv.includes("--validate");
const concurrency = 6;

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
  : { generatedAt: null, source: "カンコー学生服 全国販売店検索", entries: {} };

const decodeHtml = (value) => String(value || "")
  .replaceAll("&amp;", "&")
  .replaceAll("&#038;", "&")
  .replaceAll("&quot;", '"')
  .trim();

function extractHomepage(html, detailUrl) {
  const match = html.match(/<th[^>]*>\s*店舗ホームページ\s*<\/th>\s*<td[^>]*>\s*<a[^>]+href=["']([^"']+)["']/iu);
  if (!match) return "";
  const raw = decodeHtml(match[1]);
  try {
    const url = new URL(raw, detailUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function save() {
  existing.generatedAt = new Date().toISOString();
  existing.targetPriority = targetPriority;
  fs.writeFileSync(outputPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

async function fetchOne(record) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(record.detail_url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "BANTEX public-directory-maintenance/1.0" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    return {
      url: extractHomepage(html, record.detail_url),
      detailUrl: record.detail_url,
      checkedAt: new Date().toISOString(),
      pageStatus: response.status,
      error: null
    };
  } catch (error) {
    return {
      url: "",
      detailUrl: record.detail_url,
      checkedAt: new Date().toISOString(),
      pageStatus: null,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkDestination(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "BANTEX public-directory-maintenance/1.0" }
    });
    await response.body?.cancel();
    return {
      destinationUrl: response.url,
      destinationStatus: response.status,
      destinationCheckedAt: new Date().toISOString(),
      destinationError: null
    };
  } catch (error) {
    return {
      destinationUrl: "",
      destinationStatus: null,
      destinationCheckedAt: new Date().toISOString(),
      destinationError: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

const targets = source.records.filter((record) =>
  record.data_source === "カンコー学生服 全国販売店検索" &&
  record.priority === targetPriority &&
  !existing.entries[record.store_id]
);

let cursor = 0;
let completed = 0;
async function worker() {
  while (cursor < targets.length) {
    const record = targets[cursor++];
    existing.entries[record.store_id] = await fetchOne(record);
    completed += 1;
    if (completed % 25 === 0) {
      save();
      console.log(`checked ${completed}/${targets.length}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, targets.length || 1) }, () => worker()));
save();

let destinationsChecked = 0;
if (shouldValidate) {
  const byUrl = new Map();
  Object.entries(existing.entries).forEach(([storeId, entry]) => {
    if (!entry.url) return;
    if (!byUrl.has(entry.url)) byUrl.set(entry.url, []);
    byUrl.get(entry.url).push(storeId);
  });
  const destinationTasks = [...byUrl.entries()];
  let destinationCursor = 0;
  async function destinationWorker() {
    while (destinationCursor < destinationTasks.length) {
      const [url, storeIds] = destinationTasks[destinationCursor++];
      const result = await checkDestination(url);
      storeIds.forEach((storeId) => Object.assign(existing.entries[storeId], result));
      destinationsChecked += 1;
      if (destinationsChecked % 25 === 0) {
        save();
        console.log(`validated ${destinationsChecked}/${destinationTasks.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, destinationTasks.length || 1) }, () => destinationWorker()));
  save();
}

const entries = Object.values(existing.entries);
console.log(JSON.stringify({
  outputPath,
  selectedPriority: targetPriority,
  newlyChecked: completed,
  checkedTotal: entries.length,
  homepageFound: entries.filter((entry) => entry.url).length,
  pageErrors: entries.filter((entry) => entry.error).length,
  destinationsChecked,
  destinationSuccess: entries.filter((entry) => entry.destinationStatus >= 200 && entry.destinationStatus < 400).length,
  destinationErrors: entries.filter((entry) => entry.destinationError).length
}, null, 2));
