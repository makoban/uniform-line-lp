(() => {
  "use strict";

  const dataset = window.UNIFORM_PROSPECTS;
  if (!dataset || !Array.isArray(dataset.rows)) return;

  const PAGE_SIZE = 24;
  const strategy = dataset.strategy;
  const priorityOrder = { S: 0, A: 1, B: 2, C: 3 };
  const prefectures = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];
  const prefectureOrder = new Map(prefectures.map((name, index) => [name, index]));
  const statusLabels = {
    high: "公式サイト掲載あり",
    medium: "現行販売店検索に掲載",
    check: "古い掲載・要確認"
  };
  const scaleLabelFor = (group, count) => ({
    specialist: "地域専門店候補（単独掲載）",
    multi: `複数拠点候補（${count}拠点掲載）`,
    local: "地域小売店候補",
    large: "大型小売・百貨店等"
  })[group];
  const stores = dataset.rows.map((row) => {
    const [priority, score, name, prefecture, municipality, address, telephone, storeType, scaleGroup, rootCount, statusLevel, officialWeb, officialWebStatus, detailUrl, schoolListed, sourcePriority, socialStatus = "unchecked", socialPairs = [], salesRow, id, postalCode, socialCheckedAt] = row;
    const [phase, method, scoreParts, rawScore, companyCount, companyRepresentative, representativeId, pilotRank, evidenceKey] = salesRow;
    const evidence = dataset.salesEvidence.entries[evidenceKey];
    const socialLinks = socialPairs.map(([platform, url]) => ({ platform, url }));
    const hasLine = socialLinks.some((link) => link.platform === "LINE");
    const hookKey = evidence?.reservationListed ? "existing" : hasLine ? "line" : sourcePriority === "A" || evidence?.uniformRetail ? "specialist" : "qualify";
    const hook = strategy.hooks[hookKey];
    const question = strategy.questions[hookKey];
    const opening = method === "none" ? "新規営業対象外" : method === "verify"
      ? "制服販売店の掲載情報を拝見しました。現在の制服のお取り扱いと担当窓口を確認させていただけますか？"
      : method === "headquarters"
        ? "制服店向けLINE会員・学年別案内・採寸履歴のご提案です。既存の予約や顧客管理との連携について、本部または売場運営会社のご担当者様に10分ほどご説明する機会をいただけますか？"
        : `制服店様向けの「LINE制服屋アプリ」をご案内しているバンテックスです。${question} 学年の切り替わりに合わせた案内と、採寸予約・履歴・ポイント管理をまとめるご提案です。ご関心があれば、御社名を入れた画面を10分ほどご覧いただけますか？`;
    const scaleLabel = scaleLabelFor(scaleGroup, rootCount);
    const statusLabel = statusLabels[statusLevel];
    const reason = [
      evidence?.uniformRetail ? "公式HPで学校制服の取扱を確認" : sourcePriority === "A" ? "店名から制服専門店候補" : "制服取扱店として掲載",
      prefecture === "愛知県" ? "愛知県内で初期支援・訪問を組みやすい" : ["岐阜県", "三重県", "静岡県"].includes(prefecture) ? "近隣地域で初期支援を組みやすい" : "地域導入後にオンライン商談を展開",
      hasLine ? "公式HPにLINEリンク掲載（系列共通の場合あり）" : "LINE掲載・運用状況は商談で確認",
      evidence?.storeCount ? `公式HPに${companyCount}店舗掲載` : `${companyCount}拠点の共通HP・同名系列候補（運営未確認）`,
      strategy.gates[phase]
    ].filter(Boolean).join("。 ");
    return {
      id, postalCode, priority, score, name, prefecture, municipality, address, telephone, storeType,
      scaleGroup, scaleLabel, statusLevel, statusLabel, officialWeb, officialWebStatus, detailUrl, socialStatus, socialLinks,
      reason, phase, method, scoreParts, rawScore, companyCount, companyRepresentative, representativeId, pilotRank, evidence,
      socialCheckedAt, approach: strategy.approaches[method], hook, question, opening, nextAction: strategy.nextActions[method],
      searchText: [name, prefecture, municipality, address, telephone, storeType, scaleLabel, statusLabel, strategy.phaseLabels[phase], strategy.methodLabels[method], hook, ...socialLinks.map((link) => link.platform)]
        .join(" ").normalize("NFKC").toLocaleLowerCase("ja-JP")
    };
  });
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const state = { page: 1, filtered: stores };

  const elements = {
    updatedAt: document.querySelector("#updatedAt"),
    summaryGrid: document.querySelector("#summaryGrid"),
    form: document.querySelector("#filterForm"),
    search: document.querySelector("#searchInput"),
    prefecture: document.querySelector("#prefectureSelect"),
    priority: document.querySelector("#prioritySelect"),
    status: document.querySelector("#statusSelect"),
    social: document.querySelector("#socialSelect"),
    scale: document.querySelector("#scaleSelect"),
    phase: document.querySelector("#phaseSelect"),
    method: document.querySelector("#methodSelect"),
    contact: document.querySelector("#contactSelect"),
    sort: document.querySelector("#sortSelect"),
    reset: document.querySelector("#resetButton"),
    download: document.querySelector("#downloadButton"),
    hpCoverage: document.querySelector("#hpCoverage"),
    snsCoverage: document.querySelector("#snsCoverage"),
    resultCount: document.querySelector("#resultCount"),
    activeFilters: document.querySelector("#activeFilters"),
    list: document.querySelector("#storeList"),
    empty: document.querySelector("#emptyState"),
    pagination: document.querySelector("#pagination")
  };

  const normalize = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP");
  const number = (value) => new Intl.NumberFormat("ja-JP").format(value);

  function appendText(parent, tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function renderSummary() {
    const metrics = [
      ["全国の営業候補", dataset.summary.total, [`${dataset.summary.prefectures}都道府県`]],
      ["愛知・初回候補", dataset.summary.pilot, ["代表窓口候補から", "試験営業"]],
      ["優先度S・A", dataset.summary.highPriority, ["近隣支援・", "LINE活用を評価"]],
      ["本部・現況確認", dataset.summary.byPhase.headquarters + dataset.summary.byPhase.verify, ["店舗営業より", "窓口確認を先行"]],
    ];
    const fragment = document.createDocumentFragment();
    metrics.forEach(([label, value, note]) => {
      const card = document.createElement("article");
      card.className = "summary-card";
      appendText(card, "span", label);
      appendText(card, "strong", number(value));
      const caption = appendText(card, "small", "");
      note.forEach((phrase) => appendText(caption, "span", phrase, "keep"));
      fragment.append(card);
    });
    elements.summaryGrid.replaceChildren(fragment);
    elements.updatedAt.textContent = `営業方針更新：${strategy.updatedOn.replaceAll("-", ".")} ／ 元の店舗情報：${dataset.retrievedOn.replaceAll("-", ".")}`;
    elements.hpCoverage.textContent = `営業先HPの直接リンク：${number(dataset.summary.withOfficialWeb)}件（到達確認済み ${number(dataset.summary.verifiedOfficialWeb)}件）。直接URLが未掲載の店舗には「HPを検索」を表示します。`;
    const socialCheckedOn = dataset.socialCheckedAt ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(dataset.socialCheckedAt)) : "未実施";
    elements.snsCoverage.textContent = `HP掲載のSNSリンクを確認：${number(dataset.summary.withSocialLinks)}件（LINE ${number(dataset.summary.withLine)}件・Instagram ${number(dataset.summary.withInstagram)}件）。公式HPを確認できた ${number(dataset.summary.socialSitesChecked)}件を対象に調査（${socialCheckedOn}）。HP上にリンクが見つからなかった ${number(dataset.summary.socialLinkNotFound)}件も、SNSがないとは限りません。`;
  }

  function setupPrefectures() {
    const counts = new Map();
    stores.forEach((store) => counts.set(store.prefecture, (counts.get(store.prefecture) || 0) + 1));
    prefectures.forEach((prefecture) => {
      if (!counts.has(prefecture)) return;
      const option = document.createElement("option");
      option.value = prefecture;
      option.textContent = `${prefecture}（${number(counts.get(prefecture))}）`;
      elements.prefecture.append(option);
    });
  }

  function createLink(label, href, primary = false) {
    const link = document.createElement("a");
    link.className = `card-link${primary ? " primary" : ""}`;
    link.href = href;
    link.textContent = label;
    if (!href.startsWith("tel:")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  function renderCard(store) {
    const card = document.createElement("article");
    card.className = "store-card";
    card.dataset.priority = store.priority;
    card.dataset.phase = store.phase;
    card.dataset.storeId = store.id;

    const top = document.createElement("div");
    top.className = "card-top";
    const badges = document.createElement("div");
    badges.className = "badges";
    appendText(badges, "span", `優先度 ${store.priority}`, "badge badge-priority");
    appendText(badges, "span", store.pilotRank ? `初回候補 ${store.pilotRank}` : strategy.phaseLabels[store.phase], "badge badge-phase");
    appendText(badges, "span", store.statusLabel, `badge ${store.statusLevel === "check" ? "badge-check" : "badge-status"}`);
    if (store.officialWeb) appendText(badges, "span", store.officialWebStatus === "verified" ? "HP確認済" : "HP掲載", "badge badge-web");
    if (store.socialStatus === "linked") appendText(badges, "span", "SNSリンクあり", "badge badge-web");
    top.append(badges);
    appendText(top, "span", `初動 ${store.score}点`, "score");
    card.append(top);

    const title = document.createElement("div");
    title.className = "store-title";
    appendText(title, "h3", store.name);
    appendText(title, "p", `${store.prefecture}${store.municipality}｜${store.address}`);
    card.append(title);

    const signals = document.createElement("div");
    signals.className = "signal-grid";
    const scale = document.createElement("div");
    scale.className = "signal";
    appendText(scale, "span", "規模感（推定）");
    appendText(scale, "strong", store.scaleLabel);
    signals.append(scale);
    const type = document.createElement("div");
    type.className = "signal";
    appendText(type, "span", "店舗区分（元リスト）");
    appendText(type, "strong", store.storeType);
    signals.append(type);
    card.append(signals);

    if (store.phase !== "exclude") appendText(card, "p", `訴求（提案仮説）：${store.hook}`, "sales-hook");
    appendText(card, "p", `営業手法：${strategy.methodLabels[store.method]}`, "approach");
    if (!store.companyRepresentative) {
      const representative = storeById.get(store.representativeId);
      appendText(card, "p", `系列・共通HP候補：まず「${representative?.name || "代表窓口候補"}」へ。運営会社を確認し、連絡の重複を避ける。`, "group-note");
    }
    const details = document.createElement("details");
    details.className = "sales-details";
    appendText(details, "summary", "営業手順・電話文・判断根拠を見る");
    const detailBody = document.createElement("div");
    detailBody.className = "sales-detail-body";
    appendText(detailBody, "p", `進め方：${store.approach}`);
    appendText(detailBody, "p", `次の行動：${store.nextAction}`);
    if (store.phase !== "exclude") {
      appendText(detailBody, "p", `商談で確認：${store.question}`);
      appendText(detailBody, "p", "取扱校数・会員数・現在の予約方法・決裁者・既存システム・予算・配信通数を確認。1店舗・1〜3校からの初期範囲を合意する。", "qualification-note");
      appendText(detailBody, "p", `電話文（下書き）：${store.opening}`, "opening-script");
    }
    appendText(detailBody, "p", `判断根拠：${store.reason}`, "reason");
    if (store.evidence) {
      appendText(detailBody, "p", `公式HP追加確認（${dataset.salesEvidence.checkedOn}）：${store.evidence.facts}`, "evidence-note");
      detailBody.append(createLink("追加確認の公式情報", store.evidence.sourceUrl));
    }
    const breakdown = Object.values(strategy.scoreLabels).map((label, i) => `${label}：${store.scoreParts[i]}点`).join("、");
    appendText(detailBody, "p", `採点内訳：${breakdown}。合計${store.rawScore}点${store.rawScore !== store.score ? ` → ${strategy.gates[store.phase]}（初動${store.score}点）` : ""}。`, "reason");
    details.append(detailBody);
    card.append(details);
    appendText(card, "p", store.socialStatus === "linked"
      ? `SNS：HPに${[...new Set(store.socialLinks.map((link) => link.platform))].join("・")}のリンク掲載（系列共通の可能性あり）`
      : store.socialStatus === "no_link" ? "SNS：HP上にアカウントリンクを確認できず（SNSなしとは限りません）" : "SNS：未確認", "social-note");
    if (store.socialCheckedAt) appendText(card, "p", `SNSリンク確認日：${new Date(store.socialCheckedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`, "social-date");

    const links = document.createElement("div");
    links.className = "link-row";
    if (store.telephone) links.append(createLink(`電話 ${store.telephone}`, `tel:${store.telephone.replace(/[^0-9+]/g, "")}`, true));
    const homepageSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${store.name} ${store.address} 公式サイト`)}`;
    if (store.officialWeb) links.append(createLink(store.officialWebStatus === "verified" ? "営業先HP" : "HP候補（要確認）", store.officialWeb));
    else links.append(createLink("HPを検索", homepageSearchUrl));
    store.socialLinks.forEach(({ platform, url }) => links.append(createLink(platform, url)));
    if (!store.socialLinks.length) links.append(createLink("SNSを検索", `https://www.google.com/search?q=${encodeURIComponent(`${store.name} ${store.address} LINE Instagram 公式`)}`));
    if (store.detailUrl && store.detailUrl !== store.officialWeb) links.append(createLink("掲載元", store.detailUrl));
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${store.name} ${store.address} 営業時間`)}`;
    links.append(createLink("地図", mapUrl));
    links.append(createLink("営業状況を検索", searchUrl));
    card.append(links);
    return card;
  }

  function currentFilters() {
    return {
      query: normalize(elements.search.value.trim()),
      prefecture: elements.prefecture.value,
      priority: elements.priority.value,
      status: elements.status.value,
      social: elements.social.value,
      scale: elements.scale.value,
      phase: elements.phase.value,
      method: elements.method.value,
      contact: elements.contact.value,
      sort: elements.sort.value
    };
  }

  function filterAndSort() {
    const filters = currentFilters();
    const filtered = stores.filter((store) => {
      if (filters.query && !store.searchText.includes(filters.query)) return false;
      if (filters.prefecture && store.prefecture !== filters.prefecture) return false;
      if (filters.priority === "high" && !["S", "A"].includes(store.priority)) return false;
      if (filters.priority && filters.priority !== "high" && store.priority !== filters.priority) return false;
      if (filters.status && store.statusLevel !== filters.status) return false;
      if (filters.social === "linked" && store.socialStatus !== "linked") return false;
      if (["LINE", "Instagram"].includes(filters.social) && !store.socialLinks.some((link) => link.platform === filters.social)) return false;
      if (["no_link", "unchecked"].includes(filters.social) && store.socialStatus !== filters.social) return false;
      if (filters.scale && store.scaleGroup !== filters.scale) return false;
      if (filters.phase && store.phase !== filters.phase) return false;
      if (filters.method && store.method !== filters.method) return false;
      if (filters.contact === "representative" && !store.companyRepresentative) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name, "ja");
      if (filters.sort === "prefecture") {
        return (prefectureOrder.get(a.prefecture) - prefectureOrder.get(b.prefecture)) || a.name.localeCompare(b.name, "ja");
      }
      return (a.pilotRank ? 0 : a.phase === "exclude" ? 2 : 1) - (b.pilotRank ? 0 : b.phase === "exclude" ? 2 : 1) ||
        (a.pilotRank && b.pilotRank ? a.pilotRank - b.pilotRank : 0) || (priorityOrder[a.priority] - priorityOrder[b.priority]) || (b.score - a.score) ||
        (prefectureOrder.get(a.prefecture) - prefectureOrder.get(b.prefecture)) || a.name.localeCompare(b.name, "ja");
    });

    state.filtered = filtered;
    state.page = 1;
    render();
  }

  function renderActiveFilters() {
    const filters = currentFilters();
    const labels = [];
    if (filters.query) labels.push(`検索「${elements.search.value.trim()}」`);
    if (filters.prefecture) labels.push(filters.prefecture);
    if (filters.priority) labels.push(filters.priority === "high" ? "優先度S・A" : `優先度${filters.priority}`);
    if (filters.status) labels.push(elements.status.selectedOptions[0].textContent);
    if (filters.social) labels.push(elements.social.selectedOptions[0].textContent);
    if (filters.scale) labels.push(elements.scale.selectedOptions[0].textContent);
    if (filters.phase) labels.push(elements.phase.selectedOptions[0].textContent);
    if (filters.method) labels.push(elements.method.selectedOptions[0].textContent);
    if (filters.contact) labels.push(elements.contact.selectedOptions[0].textContent);
    elements.activeFilters.textContent = labels.length ? `適用中：${labels.join(" / ")}` : "全国・全条件を表示中";
  }

  function renderPagination(totalPages) {
    elements.pagination.replaceChildren();
    if (totalPages <= 1) return;

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "page-button";
    prev.textContent = "前へ";
    prev.disabled = state.page === 1;
    prev.addEventListener("click", () => changePage(state.page - 1));
    elements.pagination.append(prev);

    appendText(elements.pagination, "span", `${state.page} / ${totalPages}ページ`, "page-info");

    const next = document.createElement("button");
    next.type = "button";
    next.className = "page-button";
    next.textContent = "次へ";
    next.disabled = state.page === totalPages;
    next.addEventListener("click", () => changePage(state.page + 1));
    elements.pagination.append(next);
  }

  function changePage(page) {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, page), totalPages);
    render();
    document.querySelector("#results").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function render() {
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = state.filtered.slice(start, start + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    pageItems.forEach((store) => fragment.append(renderCard(store)));
    elements.list.replaceChildren(fragment);
    elements.resultCount.textContent = number(total);
    elements.empty.hidden = total !== 0;
    elements.download.disabled = total === 0;
    renderActiveFilters();
    renderPagination(totalPages);
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function downloadCsv() {
    const headers = ["営業優先度", "初動点数", "店舗名", "都道府県", "市区町村", "住所", "電話番号", "公開情報状態", "規模感", "店舗区分", "判断根拠", "おすすめ初動", "営業先HP", "HP確認状態", "SNS確認状態", "LINE", "Instagram", "Facebook", "X", "TikTok", "YouTube", "掲載元", "地図", "店舗ID", "郵便番号", "営業段階", "初回候補順", "営業手法", "訴求内容（提案仮説）", "商談の質問", "電話文（下書き）", "次の行動", "代表窓口候補", "代表窓口名", "系列・共通HP候補数", "公式HP追加確認の事実", "追加確認URL", "追加確認日", "SNSリンク確認日", "営業方針更新日", "元の店舗情報取得日", "採点内訳"];
    const rows = state.filtered.map((store) => [
      store.priority, store.score, store.name, store.prefecture, store.municipality, store.address,
      store.telephone, store.statusLabel, store.scaleLabel, store.storeType, store.reason,
      store.approach, store.officialWeb, store.officialWebStatus === "verified" ? "到達確認済み" : store.officialWeb ? "掲載あり・要確認" : "未掲載",
      store.socialStatus === "linked" ? "HPにリンクあり" : store.socialStatus === "no_link" ? "HPにリンク未掲載" : "未確認",
      ...["LINE", "Instagram", "Facebook", "X", "TikTok", "YouTube"].map((platform) => store.socialLinks.filter((link) => link.platform === platform).map((link) => link.url).join(" ")),
      store.detailUrl,
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`,
      store.id, store.postalCode, strategy.phaseLabels[store.phase], store.pilotRank || "",
      strategy.methodLabels[store.method], store.phase === "exclude" ? "新規営業対象外" : store.hook, store.phase === "exclude" ? "" : store.question, store.opening, store.nextAction,
      store.companyRepresentative ? "代表候補" : "系列・共通HP候補", storeById.get(store.representativeId)?.name || "", store.companyCount,
      store.evidence?.facts || "", store.evidence?.sourceUrl || "", store.evidence ? dataset.salesEvidence.checkedOn : "", store.socialCheckedAt || "", strategy.updatedOn, dataset.retrievedOn,
      Object.values(strategy.scoreLabels).map((label, i) => `${label}：${store.scoreParts[i]}`).join(" / ")
    ]);
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `制服店営業候補_${strategy.updatedOn}_${state.filtered.length}件.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  let searchTimer;
  elements.search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(filterAndSort, 120);
  });
  [elements.prefecture, elements.priority, elements.status, elements.social, elements.scale, elements.phase, elements.method, elements.contact, elements.sort]
    .forEach((element) => element.addEventListener("change", filterAndSort));
  elements.form.addEventListener("submit", (event) => event.preventDefault());
  elements.reset.addEventListener("click", () => {
    elements.form.reset();
    filterAndSort();
  });
  elements.download.addEventListener("click", downloadCsv);
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    elements.form.reset();
    if (button.dataset.preset === "high") elements.priority.value = "high";
    else elements.phase.value = button.dataset.preset;
    filterAndSort();
    document.querySelector("#results").scrollIntoView({ block: "start", behavior: "smooth" });
  }));

  renderSummary();
  setupPrefectures();
  filterAndSort();
})();
