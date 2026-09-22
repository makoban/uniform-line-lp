(() => {
  "use strict";

  const dataset = window.UNIFORM_PROSPECTS;
  if (!dataset || !Array.isArray(dataset.rows)) return;

  const PAGE_SIZE = 24;
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
  const approachFor = (priority, scaleGroup) => {
    if (scaleGroup === "large") return "店頭より先に、本部または制服売場の運営・決裁窓口を確認";
    if (priority === "S") return "店舗責任者へ直接。LINE顧客管理と採寸予約の効果を短く説明";
    if (priority === "A") return "電話で制服担当者と既存LINE運用を確認し、デモ案内へ";
    if (priority === "B") return "制服の取扱比率と繁忙期の予約・顧客管理課題を先に確認";
    return "現在の制服取扱と窓口を確認してから、営業対象に残すか判断";
  };
  const scaleLabelFor = (group, count) => ({
    specialist: "地域専門店候補（単独掲載）",
    multi: `複数拠点候補（${count}拠点掲載）`,
    local: "地域小売店候補",
    large: "大型小売・百貨店等"
  })[group];
  const stores = dataset.rows.map((row) => {
    const [priority, score, name, prefecture, municipality, address, telephone, storeType, scaleGroup, rootCount, statusLevel, officialWeb, detailUrl, schoolListed, sourcePriority] = row;
    const scaleLabel = scaleLabelFor(scaleGroup, rootCount);
    const statusLabel = statusLabels[statusLevel];
    const reason = [
      sourcePriority === "A" ? "店名から制服専門店の可能性が高い" : sourcePriority === "C" ? "大型店・校内売店等のため窓口確認が必要" : "制服取扱店として掲載",
      statusLevel === "high" ? "店舗公式サイトで所在地・電話番号を確認" : statusLevel === "medium" ? "メーカーの公開販売店検索に取得日時点で掲載" : "掲載日が古いため現況確認が必要",
      telephone ? "電話番号あり" : "電話番号未確認",
      schoolListed ? "取扱校掲載あり" : ""
    ].filter(Boolean).join("。 ");
    return {
      priority, score, name, prefecture, municipality, address, telephone, storeType,
      scaleGroup, scaleLabel, statusLevel, statusLabel, officialWeb, detailUrl,
      reason, approach: approachFor(priority, scaleGroup),
      searchText: [name, prefecture, municipality, address, telephone, storeType, scaleLabel, statusLabel]
        .join(" ").normalize("NFKC").toLocaleLowerCase("ja-JP")
    };
  });
  const state = { page: 1, filtered: stores };

  const elements = {
    updatedAt: document.querySelector("#updatedAt"),
    summaryGrid: document.querySelector("#summaryGrid"),
    form: document.querySelector("#filterForm"),
    search: document.querySelector("#searchInput"),
    prefecture: document.querySelector("#prefectureSelect"),
    priority: document.querySelector("#prioritySelect"),
    status: document.querySelector("#statusSelect"),
    scale: document.querySelector("#scaleSelect"),
    sort: document.querySelector("#sortSelect"),
    reset: document.querySelector("#resetButton"),
    download: document.querySelector("#downloadButton"),
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
      ["全国の営業候補", dataset.summary.total, `${dataset.summary.prefectures}都道府県`],
      ["優先度S・A", dataset.summary.highPriority, "先に確認したい候補"],
      ["現行掲載を確認", dataset.summary.currentlyListed, "公式・メーカー掲載"],
      ["電話番号あり", dataset.summary.withTelephone, "架電前に現況確認"],
    ];
    const fragment = document.createDocumentFragment();
    metrics.forEach(([label, value, note]) => {
      const card = document.createElement("article");
      card.className = "summary-card";
      appendText(card, "span", label);
      appendText(card, "strong", number(value));
      appendText(card, "small", note);
      fragment.append(card);
    });
    elements.summaryGrid.replaceChildren(fragment);
    elements.updatedAt.textContent = `公開情報の取得日：${dataset.retrievedOn.replaceAll("-", ".")}`;
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

    const top = document.createElement("div");
    top.className = "card-top";
    const badges = document.createElement("div");
    badges.className = "badges";
    appendText(badges, "span", `優先度 ${store.priority}`, "badge badge-priority");
    appendText(badges, "span", store.statusLabel, `badge ${store.statusLevel === "check" ? "badge-check" : "badge-status"}`);
    top.append(badges);
    appendText(top, "span", `${store.score}点`, "score");
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
    appendText(type, "span", "店舗区分");
    appendText(type, "strong", store.storeType);
    signals.append(type);
    card.append(signals);

    appendText(card, "p", `判断根拠：${store.reason}`, "reason");
    appendText(card, "p", `おすすめ初動：${store.approach}`, "approach");

    const links = document.createElement("div");
    links.className = "link-row";
    if (store.telephone) links.append(createLink(`電話 ${store.telephone}`, `tel:${store.telephone.replace(/[^0-9+]/g, "")}`, true));
    if (store.officialWeb) links.append(createLink("公式Web", store.officialWeb));
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
      scale: elements.scale.value,
      sort: elements.sort.value
    };
  }

  function filterAndSort() {
    const filters = currentFilters();
    const filtered = stores.filter((store) => {
      if (filters.query && !store.searchText.includes(filters.query)) return false;
      if (filters.prefecture && store.prefecture !== filters.prefecture) return false;
      if (filters.priority && store.priority !== filters.priority) return false;
      if (filters.status && store.statusLevel !== filters.status) return false;
      if (filters.scale && store.scaleGroup !== filters.scale) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name, "ja");
      if (filters.sort === "prefecture") {
        return (prefectureOrder.get(a.prefecture) - prefectureOrder.get(b.prefecture)) || a.name.localeCompare(b.name, "ja");
      }
      return (priorityOrder[a.priority] - priorityOrder[b.priority]) || (b.score - a.score) ||
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
    if (filters.priority) labels.push(`優先度${filters.priority}`);
    if (filters.status) labels.push(elements.status.selectedOptions[0].textContent);
    if (filters.scale) labels.push(elements.scale.selectedOptions[0].textContent);
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
    const headers = ["営業優先度", "点数", "店舗名", "都道府県", "市区町村", "住所", "電話番号", "公開情報状態", "規模感", "店舗区分", "判断根拠", "おすすめ初動", "公式Web", "掲載元", "地図"];
    const rows = state.filtered.map((store) => [
      store.priority, store.score, store.name, store.prefecture, store.municipality, store.address,
      store.telephone, store.statusLabel, store.scaleLabel, store.storeType, store.reason,
      store.approach, store.officialWeb, store.detailUrl,
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`
    ]);
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `制服店営業候補_${dataset.retrievedOn}_${state.filtered.length}件.csv`;
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
  [elements.prefecture, elements.priority, elements.status, elements.scale, elements.sort]
    .forEach((element) => element.addEventListener("change", filterAndSort));
  elements.form.addEventListener("submit", (event) => event.preventDefault());
  elements.reset.addEventListener("click", () => {
    elements.form.reset();
    filterAndSort();
  });
  elements.download.addEventListener("click", downloadCsv);

  renderSummary();
  setupPrefectures();
  filterAndSort();
})();
