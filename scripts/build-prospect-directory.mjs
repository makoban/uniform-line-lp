import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(scriptDir);
const projectDir = path.dirname(repoDir);
const sourcePath = path.join(projectDir, "outputs", "20260922-national-uniform-shops", "uniform_shop_prospects.json");
const outputPath = path.join(repoDir, "prospects", "stores.js");

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const records = source.records;

const genericRoots = new Set(["カンコーショップ", "スクールショップ", "学生服専門店", "学生服の店", "制服専門店"]);

function cleanRoot(value) {
  let root = String(value || "")
    .normalize("NFKC")
    .replace(/[　\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(?:\d+\s*)?[F階]$/i, "")
    .replace(/\s+[^ ]{1,22}(?:本店|支店|営業所|売店|店)$/u, "")
    .replace(/\s+本店$/u, "")
    .trim();
  if (root.length < 4 || genericRoots.has(root)) root = String(value || "").normalize("NFKC").trim();
  return root;
}

const rootCounts = new Map();
records.forEach((record) => {
  const root = cleanRoot(record.store_name);
  rootCounts.set(root, (rootCounts.get(root) || 0) + 1);
});

function statusFor(record) {
  if (record.data_source === "店舗公式サイト") {
    return {
      level: "high",
      label: "公式サイト掲載あり",
      points: 22,
      text: "店舗公式サイトで所在地・電話番号の掲載を確認"
    };
  }
  if (record.data_source === "カンコー学生服 全国販売店検索") {
    return {
      level: "medium",
      label: "現行販売店検索に掲載",
      points: 14,
      text: "カンコー学生服の公開販売店検索に取得日時点で掲載"
    };
  }
  return {
    level: "check",
    label: "古い掲載・要確認",
    points: 1,
    text: `販売店ナビの掲載日が古い${record.source_updated_on ? `（${record.source_updated_on}）` : ""}`
  };
}

function scaleFor(record) {
  const root = cleanRoot(record.store_name);
  const rootCount = rootCounts.get(root) || 1;
  if (record.priority === "C") {
    return { group: "large", label: "大型小売・百貨店等", points: 0, rootCount };
  }
  if (rootCount >= 2) {
    return { group: "multi", label: `複数拠点候補（${rootCount}拠点掲載）`, points: 7, rootCount };
  }
  if (record.priority === "A") {
    return { group: "specialist", label: "地域専門店候補（単独掲載）", points: 13, rootCount };
  }
  return { group: "local", label: "地域小売店候補", points: 9, rootCount };
}

function fitPoints(record) {
  if (record.priority === "A") return 40;
  if (record.store_type === "洋品・衣料店" || record.store_type === "スポーツ店") return 22;
  if (record.priority === "B") return 17;
  return 4;
}

function priorityFor(score) {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  return "C";
}

const stores = records.map((record) => {
  const status = statusFor(record);
  const scale = scaleFor(record);
  const contactPoints = (record.telephone ? 11 : 0) + (record.official_web ? 7 : 0) + (record.detail_url ? 4 : 0);
  const schoolPoints = record.school_listed === "あり" ? 3 : 0;
  const score = Math.min(100, fitPoints(record) + status.points + scale.points + contactPoints + schoolPoints);
  const priority = priorityFor(score);
  return {
    priority,
    score,
    name: record.store_name,
    prefecture: record.prefecture,
    municipality: record.municipality,
    address: record.address,
    telephone: record.telephone,
    storeType: record.store_type,
    scaleGroup: scale.group,
    rootCount: scale.rootCount,
    statusLevel: status.level,
    schoolListed: record.school_listed === "あり",
    officialWeb: record.official_web,
    detailUrl: record.detail_url,
    sourcePriority: record.priority
  };
});

stores.sort((a, b) => ({ S: 0, A: 1, B: 2, C: 3 })[a.priority] - ({ S: 0, A: 1, B: 2, C: 3 })[b.priority] || b.score - a.score || a.name.localeCompare(b.name, "ja"));

const summary = {
  total: stores.length,
  prefectures: new Set(stores.map((store) => store.prefecture)).size,
  highPriority: stores.filter((store) => store.priority === "S" || store.priority === "A").length,
  currentlyListed: stores.filter((store) => store.statusLevel !== "check").length,
  withTelephone: stores.filter((store) => store.telephone).length,
  byPriority: Object.fromEntries(["S", "A", "B", "C"].map((priority) => [priority, stores.filter((store) => store.priority === priority).length])),
  byScale: Object.fromEntries(["specialist", "multi", "local", "large"].map((group) => [group, stores.filter((store) => store.scaleGroup === group).length]))
};

const payload = {
  retrievedOn: source.retrieved_on,
  generatedAt: new Date().toISOString(),
  summary,
  rows: stores.map((store) => [
    store.priority, store.score, store.name, store.prefecture, store.municipality,
    store.address, store.telephone, store.storeType, store.scaleGroup, store.rootCount,
    store.statusLevel, store.officialWeb, store.detailUrl, store.schoolListed, store.sourcePriority
  ])
};

fs.writeFileSync(outputPath, `window.UNIFORM_PROSPECTS=${JSON.stringify(payload)};\n`, "utf8");
console.log(JSON.stringify({ outputPath, bytes: fs.statSync(outputPath).size, summary }, null, 2));
