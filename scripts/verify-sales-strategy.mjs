import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { STRATEGY, makeSalesProfile, rankSalesProfiles } from "./prospect-sales-strategy.mjs";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const store = { id: "fixture", name: "制服のテスト店", root: "制服のテスト店", prefecture: "愛知県", sourcePriority: "A", storeType: "学生服・制服専門店候補", scaleGroup: "specialist", rootCount: 1, statusLevel: "medium", telephone: "000-000-0000", officialWeb: "https://fixture.example/", officialWebStatus: "verified", socialLinks: [{ platform: "LINE", url: "https://lin.ee/fixture" }] };
const profile = (overrides = {}, evidence = undefined) => makeSalesProfile({ ...store, ...overrides }, evidence, 1);
assert.equal(profile().priority, "S");
assert.equal(profile({ prefecture: "岐阜県" }).priority, "S");
assert.equal(profile({ prefecture: "北海道" }).priority, "A");
assert.equal(profile({ socialLinks: [] }).priority, "A");
assert.match(profile({ socialLinks: [] }).reason, /未確認/);
assert.equal(profile({ socialLinks: [] }).reason.includes("紙運用している"), false);
for (const p of [profile({ scaleGroup: "large" }), profile({ rootCount: 6 })]) {
  assert.equal(p.priority, "C");
  assert.equal(p.phase, "headquarters");
  assert.equal(p.method, "headquarters");
  assert.ok(p.score <= 49);
}
assert.equal(profile({ statusLevel: "check" }).priority, "C");
assert.equal(profile({ statusLevel: "check" }).phase, "verify");
assert.equal(profile({ telephone: "" }).method, "verify");
assert.equal(profile({ name: "(有)勇吉屋 本店" }).phase, "exclude");
assert.equal(profile({ name: "(有)勇吉屋 本店" }).score, 0);
assert.match(profile({}, { uniformRetail: true, reservationListed: true, storeCount: 3, facts: "予約導線あり", sourceUrl: store.officialWeb }).hook, /既存の採寸予約を活かし/);

const chain = [{ ...store, id: "branch", name: "制服のテスト店 支店" }, { ...store, id: "main", name: "制服のテスト店 本店" }];
chain.forEach((s) => { s.sales = makeSalesProfile(s, undefined, 2); });
rankSalesProfiles(chain);
assert.equal(chain.filter((s) => s.sales.phase === "pilot").length, 1);
assert.equal(chain.find((s) => s.sales.phase === "pilot").id, "main");
assert.equal(chain.find((s) => s.id === "branch").sales.representativeId, "main");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(repo, "prospects/stores.js"), "utf8"), sandbox);
const d = sandbox.window.UNIFORM_PROSPECTS;
const source = JSON.parse(fs.readFileSync(path.join(repo, "../outputs/20260922-national-uniform-shops/uniform_shop_prospects.json"), "utf8"));
assert.equal(d.rows.length, source.records.length);
assert.equal(new Set(d.rows.map((r) => r[19])).size, source.records.length);
const originals = new Map(source.records.map((r) => [r.store_id, r]));
for (const row of d.rows) {
  assert.equal(row[2], originals.get(row[19]).store_name);
  assert.equal(row[6], originals.get(row[19]).telephone);
  assert.equal(row[18].length, 9);
  assert.equal(row[18][2].length, 5);
  assert.equal(row[18][2].reduce((a, b) => a + b, 0), row[18][3]);
  assert.ok(row[1] <= row[18][3] && row[1] >= 0 && row[1] <= 100);
  if (row[0] === "S") {
    assert.ok(row[1] >= 90);
    assert.ok(row[17].some(([platform]) => platform === "LINE"));
    assert.equal(row[12], "verified");
  }
  if (row[18][0] === "headquarters") assert.ok(row[1] <= 49);
  if (row[18][0] === "verify") assert.ok(row[1] <= 39);
}
const pilot = d.rows.filter((r) => r[18][0] === "pilot");
assert.equal(pilot.length, STRATEGY.pilotLimit);
assert.equal(new Set(pilot.map((r) => r[18][6])).size, pilot.length);
for (const row of pilot) {
  assert.equal(row[3], "愛知県");
  assert.ok(row[6] && row[10] !== "check" && row[18][4] <= 5 && row[18][5]);
}
assert.deepEqual(Array.from(pilot, (r) => r[18][7]).sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i + 1));
console.log(JSON.stringify({ passed: true, total: d.rows.length, pilot: pilot.length, priorities: d.summary.byPriority, phases: d.summary.byPhase, datasetBytes: fs.statSync(path.join(repo, "prospects/stores.js")).size }, null, 2));
