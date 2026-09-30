import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STRATEGY, groupKey, makeSalesProfile, rankSalesProfiles, websiteHost } from "./prospect-sales-strategy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(scriptDir);
const projectDir = path.dirname(repoDir);
const sourcePath = path.join(projectDir, "outputs", "20260922-national-uniform-shops", "uniform_shop_prospects.json");
const outputPath = path.join(repoDir, "prospects", "stores.js");
const officialWebPath = path.join(projectDir, "outputs", "20260922-national-uniform-shops", "official-web-enrichment.json");
const socialLinksPath = path.join(projectDir, "outputs", "20260922-national-uniform-shops", "social-link-enrichment.json");
const salesEvidence = JSON.parse(fs.readFileSync(path.join(repoDir, "prospects", "sales-evidence.json"), "utf8"));

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const records = source.records;
const officialWebEntries = fs.existsSync(officialWebPath)
  ? JSON.parse(fs.readFileSync(officialWebPath, "utf8")).entries || {}
  : {};
const socialEnrichment = fs.existsSync(socialLinksPath)
  ? JSON.parse(fs.readFileSync(socialLinksPath, "utf8"))
  : { entries: {} };
const socialEntries = socialEnrichment.entries || {};

function enrichedOfficialWeb(storeId) {
  const entry = officialWebEntries[storeId];
  if (!entry?.url || [404, 410].includes(entry.destinationStatus)) return { url: "", status: "none" };
  if (entry.destinationError || entry.destinationStatus >= 400) return { url: entry.url, status: "listed" };
  return { url: entry.destinationUrl || entry.url, status: "verified" };
}

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

const stores = records.map((record) => {
  const status = statusFor(record);
  const scale = scaleFor(record);
  const enrichedWeb = enrichedOfficialWeb(record.store_id);
  const officialWeb = record.official_web || enrichedWeb.url;
  const officialWebStatus = record.official_web ? "verified" : enrichedWeb.status;
  const socialEntry = officialWebStatus === "verified" ? socialEntries[officialWeb] : null;
  const socialLinks = socialEntry?.status === "checked" ? socialEntry.links || [] : [];
  const socialStatus = socialEntry?.status === "checked" ? (socialLinks.length ? "linked" : "no_link") : "unchecked";
  return {
    id: record.store_id,
    root: cleanRoot(record.store_name),
    name: record.store_name,
    prefecture: record.prefecture,
    municipality: record.municipality,
    address: record.address,
    postalCode: record.postal_code || "",
    telephone: record.telephone,
    storeType: record.store_type,
    scaleGroup: scale.group,
    rootCount: scale.rootCount,
    statusLevel: status.level,
    schoolListed: record.school_listed === "あり",
    officialWeb,
    officialWebStatus,
    socialStatus,
    socialLinks,
    socialCheckedAt: socialEntry?.checkedAt || "",
    detailUrl: record.detail_url,
    sourcePriority: record.priority
  };
});

const companyCounts = new Map();
stores.forEach((store) => {
  const key = groupKey(store);
  companyCounts.set(key, (companyCounts.get(key) || 0) + 1);
});
stores.forEach((store) => {
  const evidence = salesEvidence.entries[websiteHost(store.officialWeb)];
  store.sales = makeSalesProfile(store, evidence, companyCounts.get(groupKey(store)) || 1);
  store.priority = store.sales.priority;
  store.score = store.sales.score;
  if (evidence?.uniformRetail && store.scaleGroup !== "large") {
    store.scaleGroup = store.sales.companyCount > 1 ? "multi" : "specialist";
  }
  store.rootCount = store.sales.companyCount;
  if (evidence?.schoolListed) store.schoolListed = true;
});
rankSalesProfiles(stores);

const summary = {
  total: stores.length,
  prefectures: new Set(stores.map((store) => store.prefecture)).size,
  highPriority: stores.filter((store) => store.priority === "S" || store.priority === "A").length,
  currentlyListed: stores.filter((store) => store.statusLevel !== "check").length,
  withTelephone: stores.filter((store) => store.telephone).length,
  withOfficialWeb: stores.filter((store) => store.officialWeb).length,
  verifiedOfficialWeb: stores.filter((store) => store.officialWebStatus === "verified").length,
  withSocialLinks: stores.filter((store) => store.socialStatus === "linked").length,
  withLine: stores.filter((store) => store.socialLinks.some((link) => link.platform === "LINE")).length,
  withInstagram: stores.filter((store) => store.socialLinks.some((link) => link.platform === "Instagram")).length,
  socialSitesChecked: stores.filter((store) => store.socialStatus !== "unchecked").length,
  socialLinkNotFound: stores.filter((store) => store.socialStatus === "no_link").length,
  pilot: stores.filter((store) => store.sales.phase === "pilot").length,
  aichi: stores.filter((store) => store.prefecture === "愛知県").length,
  manuallyReviewed: stores.filter((store) => store.sales.evidence).length,
  representativeContacts: stores.filter((store) => store.sales.companyRepresentative && store.sales.phase !== "exclude").length,
  byPhase: Object.fromEntries(Object.keys(STRATEGY.phaseLabels).map((phase) => [phase, stores.filter((store) => store.sales.phase === phase).length])),
  byPriority: Object.fromEntries(["S", "A", "B", "C"].map((priority) => [priority, stores.filter((store) => store.priority === priority).length])),
  byScale: Object.fromEntries(["specialist", "multi", "local", "large"].map((group) => [group, stores.filter((store) => store.scaleGroup === group).length]))
};

const payload = {
  retrievedOn: source.retrieved_on,
  generatedAt: new Date().toISOString(),
  socialCheckedAt: socialEnrichment.generatedAt || "",
  strategy: STRATEGY,
  salesEvidence,
  summary,
  rows: stores.map((store) => [
    store.priority, store.score, store.name, store.prefecture, store.municipality,
    store.address, store.telephone, store.storeType, store.scaleGroup, store.rootCount,
    store.statusLevel, store.officialWeb, store.officialWebStatus, store.detailUrl, store.schoolListed, store.sourcePriority,
    store.socialStatus, store.socialLinks.map(({ platform, url }) => [platform, url]),
    [store.sales.phase, store.sales.method, Object.values(store.sales.scoreParts), store.sales.rawScore,
      store.sales.companyCount, store.sales.companyRepresentative, store.sales.representativeId, store.sales.pilotRank,
      salesEvidence.entries[websiteHost(store.officialWeb)] ? websiteHost(store.officialWeb) : ""],
    store.id, store.postalCode, store.socialCheckedAt
  ])
};

fs.writeFileSync(outputPath, `window.UNIFORM_PROSPECTS=${JSON.stringify(payload)};\n`, "utf8");
console.log(JSON.stringify({ outputPath, bytes: fs.statSync(outputPath).size, summary }, null, 2));
