const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("/Users/banmako/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const baseUrl = process.argv[2] || "http://127.0.0.1:8766/prospects/";
const outputDir = "/tmp/uniform-prospects-qa";
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
      ".summary-card", ".filter-grid", ".results-toolbar", ".store-card", ".signal", ".card-link"
    ];
    const failures = [];
    document.querySelectorAll(selectors.join(",")).forEach((element) => {
      if (!visible(element)) return;
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement?.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1) {
        failures.push({ type: "viewport", node: element.tagName, className: element.className, left: rect.left, right: rect.right, width: innerWidth });
      }
      if (parent && (rect.left < parent.left - 1 || rect.right > parent.right + 1)) {
        failures.push({ type: "parent", node: element.tagName, className: element.className, left: rect.left, right: rect.right, parentLeft: parent.left, parentRight: parent.right });
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

    await page.selectOption("#prioritySelect", "S");
    await page.waitForFunction(() => document.querySelector("#resultCount")?.textContent === "12");
    const priorityCount = await page.locator("#resultCount").textContent();

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
    const downloadPromise = page.waitForEvent("download");
    await page.click("#downloadButton");
    const download = await downloadPromise;
    const downloadName = download.suggestedFilename();
    const hrefs = await page.locator(".store-card:first-child .card-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const functionalLayout = await inspectLayout(page);
    results.push({ browser: browserName, functional: true, priorityCount, staleCount, aichiCount, searchCount, downloadName, hrefs, errors, ...functionalLayout });
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
    (!result.functional && (result.status !== 200 || result.count !== "3,177" || result.cards !== 24 || result.scrollWidth > result.clientWidth + 1)) ||
    (result.functional && (result.priorityCount !== "12" || result.staleCount !== "86" || Number(result.searchCount.replaceAll(",", "")) < 1 || !result.downloadName.endsWith(".csv")))
  );
  const report = { baseUrl, outputDir, passed: failures.length === 0, results, failures };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failures.length ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
