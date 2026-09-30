const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("/Users/banmako/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const baseUrl = process.argv[2] || "http://127.0.0.1:8766/prospects/";
const outputDir = process.argv[3] || "/tmp/uniform-prospects-qa";
const widths = [320, 360, 375, 390, 393, 412, 430, 1440];
fs.mkdirSync(outputDir, { recursive: true });

async function inspectLayout(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const selectors = [
      "input", "select", "button", ".header-inner", ".hero-inner", ".section-inner",
      ".summary-card", ".filter-grid", ".results-toolbar", ".store-card", ".signal", ".card-link",
      ".playbook-grid", ".playbook-grid article", ".sales-details", ".sales-detail-body", ".quick-filters", ".keep"
    ];
    const failures = [];
    document.querySelectorAll(selectors.join(",")).forEach((element) => {
      if (!visible(element)) return;
      const rect = element.getBoundingClientRect();
      const parentElement = element.parentElement;
      const parent = parentElement?.getBoundingClientRect();
      const parentStyle = parentElement ? getComputedStyle(parentElement) : null;
      const parentLeft = parent && parentStyle ? parent.left + parseFloat(parentStyle.borderLeftWidth) + parseFloat(parentStyle.paddingLeft) : parent?.left;
      const parentRight = parent && parentStyle ? parent.right - parseFloat(parentStyle.borderRightWidth) - parseFloat(parentStyle.paddingRight) : parent?.right;
      if (rect.left < -1 || rect.right > innerWidth + 1) {
        failures.push({ type: "viewport", node: element.tagName, className: element.className, left: rect.left, right: rect.right, width: innerWidth });
      }
      if (parent && (rect.left < parentLeft - 1 || rect.right > parentRight + 1)) {
        failures.push({ type: "parent", node: element.tagName, className: element.className, left: rect.left, right: rect.right, parentLeft, parentRight });
      }
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyTextLength: document.body.innerText.trim().length,
      cards: document.querySelectorAll(".store-card").length,
      failures
    };
  });
}

async function verifyBrowser(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const results = [];
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1100 : 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.locator(".store-card").first().waitFor();
      const layout = await inspectLayout(page);
      const count = await page.locator("#resultCount").textContent();
      const overlay = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
      results.push({ browser: browserName, width, status: response?.status(), count, overlay, errors, ...layout });
      if ((width === 390 || width === 1440) && browserName === "chromium") {
        await page.screenshot({ path: path.join(outputDir, `${browserName}-${width}.png`), fullPage: true });
      }
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const expectedPriorityCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.summary.byPriority.S));
    const expectedHomepageCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.summary.withOfficialWeb));
    const expectedSocialCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.summary.withSocialLinks));
    const expectedLineCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.summary.withLine));
    await page.selectOption("#prioritySelect", "S");
    await page.waitForFunction((expected) => document.querySelector("#resultCount")?.textContent === expected, expectedPriorityCount);
    const priorityCount = await page.locator("#resultCount").textContent();
    const homepageCoverage = await page.locator("#hpCoverage").textContent();
    const homepageButtons = await page.getByRole("link", { name: "営業先HP", exact: true }).count();

    await page.click("#resetButton");
    await page.selectOption("#socialSelect", "linked");
    await page.waitForFunction((expected) => document.querySelector("#resultCount")?.textContent === expected, expectedSocialCount);
    const socialCount = await page.locator("#resultCount").textContent();
    const socialCoverage = await page.locator("#snsCoverage").textContent();
    const socialButtons = await page.getByRole("link", { name: /^(LINE|Instagram|Facebook|X|TikTok|YouTube)$/ }).count();

    await page.click("#resetButton");
    await page.selectOption("#socialSelect", "LINE");
    await page.waitForFunction((expected) => document.querySelector("#resultCount")?.textContent === expected, expectedLineCount);
    const lineCount = await page.locator("#resultCount").textContent();

    await page.click("#resetButton");
    await page.selectOption("#statusSelect", "check");
    await page.waitForFunction(() => document.querySelector("#resultCount")?.textContent === "86");
    const staleCount = await page.locator("#resultCount").textContent();

    await page.click("#resetButton");
    await page.selectOption("#prefectureSelect", "愛知県");
    await page.waitForTimeout(50);
    const aichiCount = await page.locator("#resultCount").textContent();

    await page.click("#resetButton");
    await page.fill("#searchInput", "学生服のタナカ");
    await page.waitForTimeout(200);
    const searchCount = await page.locator("#resultCount").textContent();

    await page.click("#resetButton");
    const noHomepageName = await page.evaluate(() => window.UNIFORM_PROSPECTS.rows.find((row) => !row[11])?.[2]);
    await page.fill("#searchInput", noHomepageName);
    await page.waitForTimeout(200);
    const fallbackHomepageButtons = await page.getByRole("link", { name: "HPを検索", exact: true }).count();

    await page.click("#resetButton");
    await page.click('[data-preset="pilot"]');
    const pilotCount = await page.locator("#resultCount").textContent();
    const pilotCardsValid = await page.locator(".store-card").evaluateAll((cards) => cards.every((card) => card.dataset.phase === "pilot" && card.innerText.includes("愛知県")));
    await page.getByRole("button", { name: "次へ", exact: true }).click();
    const pilotSecondPageCards = await page.locator(".store-card").count();
    await page.getByRole("button", { name: "前へ", exact: true }).click();

    await page.click('[data-preset="high"]');
    const highCount = await page.locator("#resultCount").textContent();
    const expectedHighCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.summary.highPriority));
    await page.click('[data-preset="headquarters"]');
    const headquartersCount = await page.locator("#resultCount").textContent();
    const expectedHeadquartersCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.summary.byPhase.headquarters));
    const headquartersCardsValid = await page.locator(".store-card").evaluateAll((cards) => cards.every((card) => card.dataset.priority === "C" && card.innerText.includes("本部")));

    await page.click("#resetButton");
    await page.selectOption("#methodSelect", "postal");
    const postalCount = await page.locator("#resultCount").textContent();
    const expectedPostalCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.rows.filter((r) => r[18][1] === "postal").length));
    await page.click("#resetButton");
    await page.selectOption("#contactSelect", "representative");
    const representativeCount = await page.locator("#resultCount").textContent();
    const expectedRepresentativeCount = await page.evaluate(() => String(window.UNIFORM_PROSPECTS.rows.filter((r) => r[18][5]).length));

    await page.click("#resetButton");
    await page.fill("#searchInput", "糸重");
    await page.waitForFunction(() => document.querySelector("#storeList h3")?.textContent.includes("糸重") && document.querySelector("#resultCount")?.textContent === "1");
    await page.locator(".sales-details summary").first().click();
    const reservationHook = await page.locator(".sales-hook").first().textContent();
    const openingVisible = await page.locator(".opening-script").first().isVisible();
    const expandedLayout = await inspectLayout(page);
    results.push({ browser: browserName, expanded: true, errors: [], ...expandedLayout });

    await page.click("#resetButton");
    await page.fill("#searchInput", "存在しない制服店ZZZ_20260930");
    await page.waitForFunction(() => document.querySelector("#resultCount")?.textContent === "0");
    const emptyVisible = await page.locator("#emptyState").isVisible();
    const emptyDownloadDisabled = await page.locator("#downloadButton").isDisabled();

    await page.click('[data-preset="pilot"]');
    const downloadPromise = page.waitForEvent("download");
    await page.click("#downloadButton");
    const download = await downloadPromise;
    const downloadName = download.suggestedFilename();
    const csv = fs.readFileSync(await download.path(), "utf8");
    const csvHeader = csv.split("\r\n", 1)[0];
    const csvRows = csv.split("\r\n").length - 1;
    fs.copyFileSync(await download.path(), path.join(outputDir, "制服店営業候補_2026-09-30_30件.csv"));
    const hrefs = await page.locator(".store-card:first-child .card-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const functionalLayout = await inspectLayout(page);
    results.push({ browser: browserName, functional: true, expectedPriorityCount, priorityCount, expectedHomepageCount, homepageCoverage, homepageButtons, expectedSocialCount, socialCount, socialCoverage, socialButtons, expectedLineCount, lineCount, fallbackHomepageButtons, staleCount, aichiCount, searchCount, pilotCount, pilotCardsValid, pilotSecondPageCards, highCount, expectedHighCount, headquartersCount, expectedHeadquartersCount, headquartersCardsValid, postalCount, expectedPostalCount, representativeCount, expectedRepresentativeCount, reservationHook, openingVisible, emptyVisible, emptyDownloadDisabled, downloadName, csvHeader, csvRows, hrefs, errors, ...functionalLayout });
    await context.close();
  } finally {
    await browser.close();
  }
  return results;
}

(async () => {
  const results = [
    ...(await verifyBrowser(chromium, "chromium")),
    ...(await verifyBrowser(webkit, "webkit"))
  ];
  const failures = results.filter((result) =>
    result.errors?.length || result.overlay || result.failures?.length ||
    result.scrollWidth > result.clientWidth + 1 ||
    (!result.functional && !result.expanded && (result.status !== 200 || result.count !== "3,177" || result.cards !== 24)) ||
    (result.functional && (result.priorityCount !== result.expectedPriorityCount || !result.homepageCoverage.includes(result.expectedHomepageCount) || result.homepageButtons < 1 || result.socialCount !== result.expectedSocialCount || !result.socialCoverage.includes(result.expectedSocialCount) || result.socialButtons < 1 || result.lineCount !== result.expectedLineCount || result.fallbackHomepageButtons < 1 || result.staleCount !== "86" || Number(result.searchCount.replaceAll(",", "")) < 1 || result.pilotCount !== "30" || !result.pilotCardsValid || result.pilotSecondPageCards !== 6 || result.highCount !== result.expectedHighCount || result.headquartersCount !== result.expectedHeadquartersCount || !result.headquartersCardsValid || result.postalCount.replaceAll(",", "") !== result.expectedPostalCount || result.representativeCount.replaceAll(",", "") !== result.expectedRepresentativeCount || !result.openingVisible || !result.emptyVisible || !result.emptyDownloadDisabled || result.csvRows !== 30 || !result.downloadName.endsWith(".csv") || !["営業手法", "商談の質問", "電話文（下書き）", "初回候補順", "Instagram", "LINE"].every((header) => result.csvHeader.includes(header))))
  );
  const report = { baseUrl, outputDir, passed: failures.length === 0, results, failures };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failures.length ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
