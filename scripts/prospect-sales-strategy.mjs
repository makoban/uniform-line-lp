export const STRATEGY = {
  version: "2026-09-30-v2",
  updatedOn: "2026-09-30",
  pilotLimit: 30,
  phaseLabels: {
    pilot: "愛知・初回30候補",
    expand: "地域・全国展開",
    qualify: "課題・取扱を確認",
    headquarters: "本部・運営会社へ",
    verify: "現況・連絡先を確認",
    exclude: "既存導入先・新規対象外"
  },
  methodLabels: {
    intro: "紹介→責任者デモ",
    postal: "A5郵送→2〜3営業日後に電話",
    phone: "電話で課題確認→資料・デモ",
    headquarters: "本部・運営会社の窓口確認",
    verify: "公式HP・電話で現況確認",
    none: "新規営業の対象外"
  },
  scoreLabels: { fit: "制服店との適合 / 30", region: "訪問・初期支援 / 20", digital: "LINE等の公開導線 / 20", access: "小規模導入のしやすさ / 15", evidence: "掲載・連絡先の確認 / 15" }
};

STRATEGY.approaches = {
  postal: "紹介者がいる場合は責任者を紹介してもらう。紹介がなければ責任者宛てにA5チラシを郵送し、2〜3営業日後に電話。関心を確認して店名入りの10分デモへ。",
  phone: "電話で制服担当者・取扱量・予約方法を確認。課題が合えば資料を送り、店名入りの10分デモを案内。",
  headquarters: "本部または制服売場の運営会社に、既存システムと決裁窓口を確認。1店舗での試験導入を提案し、系列店へ重複営業しない。",
  verify: "公式HP・メーカー掲載元・電話で営業状況と制服取扱、担当者を確認。確認できたら優先度を再評価。",
  none: "既存導入先のため、新規営業先としては連絡しない。"
};
STRATEGY.hooks = {
  existing: "既存の採寸予約を活かし、学年別の買い替え案内・採寸履歴・会員情報をLINEでまとめる提案",
  line: "今のLINEを活かして、学年の切り替わり・買い替え時期の案内と採寸予約をまとめる提案",
  specialist: "小学校から高校までのお客様を管理し、必要な時期の案内と採寸予約をLINEで簡単にする提案",
  qualify: "制服の取扱量と予約方法を確認し、在校生の追加購入・買い替え案内にLINEを使う提案"
};
STRATEGY.questions = {
  existing: "現在の予約システムとLINE会員・採寸履歴は連携していますか？ 学年ごとの案内対象はどのように選んでいますか？",
  line: "現在のLINEでは、学校・学年別の案内や採寸予約をどのように管理されていますか？",
  specialist: "採寸予約と、在校生の買い替え・追加購入の案内は、今どのように管理されていますか？",
  qualify: "採寸予約と、在校生の買い替え・追加購入の案内は、今どのように管理されていますか？"
};
STRATEGY.nextActions = {
  postal: "責任者・送付先・紹介経路を確認してA5を準備",
  phone: "制服担当者と取扱・予約方法を確認",
  headquarters: "本部・運営会社の導入窓口を確認",
  verify: "営業状況・連絡先・制服取扱を再確認",
  none: "新規営業から除外"
};
STRATEGY.gates = {
  exclude: "既存導入プロジェクトの店舗として新規営業から除外",
  verify: "古い掲載または電話未確認のため、現況確認を先行",
  headquarters: "大型売場または6拠点以上の共通運営候補は、店舗ごとの営業より本部確認を先行"
};

export function websiteHost(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

const sharedHosts = new Set(["kanko-gakuseifuku.co.jp", "plaza-a.jp", "tombo.gr.jp", "kanko-shop.jp", "ameblo.jp", "facebook.com", "instagram.com"]);

export function groupKey(store) {
  const host = websiteHost(store.officialWeb);
  return host && !sharedHosts.has(host) ? `web:${host}` : `name:${store.root}`;
}

export function makeSalesProfile(store, evidence, companyCount) {
  const hasLine = store.socialLinks.some((link) => link.platform === "LINE");
  const hasSocial = store.socialLinks.length > 0;
  const count = evidence?.storeCount || Math.max(store.rootCount, companyCount);
  const specialist = store.sourcePriority === "A" || evidence?.uniformRetail === true;
  const large = store.scaleGroup === "large" || count > 5;
  const tokai = ["岐阜県", "三重県", "静岡県"].includes(store.prefecture);
  const scoreParts = {
    fit: evidence?.uniformRetail ? (evidence.mixedBusiness ? 22 : 30) : store.sourcePriority === "A" ? 28 : ["洋品・衣料店", "スポーツ店"].includes(store.storeType) ? 18 : 12,
    region: store.prefecture === "愛知県" ? 20 : tokai ? 12 : 0,
    digital: hasLine ? 20 : hasSocial ? 8 : store.officialWebStatus === "verified" ? 5 : 0,
    access: large ? 0 : count <= 5 ? 15 : 5,
    evidence: (evidence || store.statusLevel === "high" || store.officialWebStatus === "verified" ? 10 : store.statusLevel === "medium" ? 5 : 0) + (store.telephone ? 5 : 0)
  };
  const rawScore = Object.values(scoreParts).reduce((sum, value) => sum + value, 0);
  const excluded = /勇吉屋/u.test(store.name);
  let score = rawScore;
  let gate = "";
  let phase = "qualify";
  if (excluded) {
    score = 0; phase = "exclude"; gate = "既存導入プロジェクトの店舗として新規営業から除外";
  } else if (store.statusLevel === "check" || !store.telephone) {
    score = Math.min(rawScore, 39); phase = "verify"; gate = "古い掲載または電話未確認のため、現況確認を先行";
  } else if (large) {
    score = Math.min(rawScore, 49); phase = "headquarters"; gate = "大型売場または6拠点以上の共通運営候補は、店舗ごとの営業より本部確認を先行";
  } else if (specialist && score >= 70) {
    phase = "expand";
  }
  const priority = ["exclude", "verify", "headquarters"].includes(phase) ? "C" : score >= 90 && specialist && hasLine && store.officialWebStatus === "verified" ? "S" : score >= 70 ? "A" : score >= 40 ? "B" : "C";
  const method = phase === "exclude" ? "none" : phase === "verify" ? "verify" : phase === "headquarters" ? "headquarters" : specialist || hasLine ? "postal" : "phone";
  const hookKey = evidence?.reservationListed ? "existing" : hasLine ? "line" : specialist ? "specialist" : "qualify";
  const hook = STRATEGY.hooks[hookKey];
  const approach = STRATEGY.approaches[method];
  const question = STRATEGY.questions[hookKey];
  const opening = `制服店様向けの「LINE制服屋アプリ」をご案内しているバンテックスです。${question} 学年の切り替わりに合わせた案内と、採寸予約・履歴・ポイント管理をまとめるご提案です。ご関心があれば、御社名を入れた画面を10分ほどご覧いただけますか？`;
  const regionReason = store.prefecture === "愛知県" ? "愛知県内で初期支援・訪問を組みやすい" : tokai ? "近隣地域として初期支援を組みやすい" : "地域での導入確認後にオンライン商談を展開";
  const reasons = [
    evidence?.uniformRetail ? "公式HPで学校制服の取扱を確認" : store.sourcePriority === "A" ? "店名から制服専門店候補" : "メーカー等の制服販売店情報に掲載",
    regionReason,
    hasLine ? "公式HPにLINEリンク掲載（系列共通の場合あり）" : hasSocial ? "公式HPにSNSリンク掲載・LINEは未確認" : "LINE掲載状況は未確認",
    evidence?.storeCount ? `公式HPに${count}店舗掲載` : `${count}拠点の共通HP・同名系列候補（実際の運営・規模は未確認）`,
    evidence?.reservationListed ? "既存の採寸予約導線あり・連携提案から開始" : "予約方法・会員数・紙運用の有無は商談で確認",
    gate
  ].filter(Boolean);
  return {
    priority, score, phase, method, hook, approach, opening, question,
    reason: reasons.join("。 "), scoreParts, rawScore, gate,
    companyKey: groupKey(store), companyCount: count,
    companyRepresentative: false, representativeName: "", representativeId: "", pilotRank: null,
    hasLine, reservationListed: evidence?.reservationListed === true,
    evidence: evidence ? { checkedOn: STRATEGY.updatedOn, facts: evidence.facts, sourceUrl: evidence.sourceUrl } : null,
    nextAction: STRATEGY.nextActions[method]
  };
}

export function rankSalesProfiles(stores) {
  const order = { S: 0, A: 1, B: 2, C: 3 };
  const compare = (a, b) => order[a.sales.priority] - order[b.sales.priority] || b.sales.score - a.sales.score || Number(/本店|本社/.test(b.name)) - Number(/本店|本社/.test(a.name)) || a.name.localeCompare(b.name, "ja");
  const groups = new Map();
  stores.forEach((store) => {
    const key = store.sales.companyKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(store);
  });
  for (const group of groups.values()) {
    group.sort(compare);
    group.forEach((store, index) => {
      store.sales.companyRepresentative = index === 0;
      store.sales.representativeName = group[0].name;
      store.sales.representativeId = group[0].id;
    });
  }
  const pilot = stores.filter((store) => store.prefecture === "愛知県" && store.sales.companyRepresentative && ["expand", "qualify"].includes(store.sales.phase) && store.sales.score >= 55 && (store.sourcePriority === "A" || store.sales.evidence || store.sales.hasLine)).sort(compare).slice(0, STRATEGY.pilotLimit);
  pilot.forEach((store, index) => { store.sales.phase = "pilot"; store.sales.pilotRank = index + 1; });
  stores.sort((a, b) => (a.sales.phase === "pilot" ? 0 : a.sales.phase === "exclude" ? 2 : 1) - (b.sales.phase === "pilot" ? 0 : b.sales.phase === "exclude" ? 2 : 1) || compare(a, b));
  return stores;
}
