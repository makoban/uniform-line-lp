# 全国制服屋専門DXサービス

制服屋さんが考えた、全国の制服店向けDXサービスの営業用ランディングページです。売上アップ（LINE会員通知・HP/SNS刷新・EC新設）、コスト削減（採寸記録のデジタル化・見積書作成/印刷）、人材採用（SNS連携）を、導入後も伴走して支援する内容です。

- 公開ページ: https://makoban.github.io/uniform-line-lp/
- 営業候補一覧: https://makoban.github.io/uniform-line-lp/prospects/
- BANTEX公式サイト: https://bantex.jp/ （ページ下部のボタンから別タブで開く）
- BANTEX公式LINE: https://lin.ee/nOxm8hI （ユーザー提供QRと一致）
- B5両面チラシ: https://makoban.github.io/uniform-line-lp/uniform-dx-b5.pdf （Instagram連携v4版）
- 表示価格: 30万円〜（税別）。対応範囲・運用費は個別お見積り。全機能が一律に含まれるという意味ではありません。
- PC・スマートフォン別の生成画像をレスポンシブ配信
- 検索エンジンの登録対象外とする `noindex` 設定

アプリ画面は架空データによるデモです。チラシのLINE販売通知とInstagram投稿は配信・投稿イメージで、実配信済みの画面ではありません。連携は初期設定と個別設計を前提とします。今回のLP公開は、アプリの本番機能、LINE設定、Instagram投稿、BASEやAirレジの連携状態を変更しません。

チラシPDFはJIS B5（182×257mm）の2ページ・RGB確認版です。生成原画は約147ppiで、印刷会社へのPDF/X、CMYK、塗り足しやトンボを検証済みの入稿データではありません。

## 営業候補一覧の更新

`../outputs/20260922-national-uniform-shops/uniform_shop_prospects.json` を元に、次のコマンドで公開用データを再生成します。

```bash
node scripts/build-prospect-directory.mjs
```

優先候補の営業先HPをカンコー店舗詳細から更新する場合は、先に次を実行します。

```bash
node scripts/enrich-official-web.mjs --priority=A
node scripts/enrich-official-web.mjs --priority=B
node scripts/enrich-official-web.mjs --priority=C
node scripts/enrich-official-web.mjs --priority=A --validate
node scripts/build-prospect-directory.mjs
```

営業先HPに掲載されたSNSアカウントへの直接リンクを更新する場合は、HP更新後に次を実行します。結果は `../outputs/20260922-national-uniform-shops/social-link-enrichment.json` に保存されます。

```bash
node scripts/enrich-social-links.mjs --refresh
node scripts/build-prospect-directory.mjs
```

LINE・Instagram・Facebook・X・TikTok・YouTubeのリンクを確認します。HP上のリンクが見つからないことは、SNSアカウントが存在しない証拠ではありません。系列共通アカウントが含まれる可能性があります。

「現在営業」は公開情報の掲載状態であり、営業中を保証しません。訪問・架電前に公式サイトまたは電話で確認します。

## 営業方針 v2（2026-09-30）

`scripts/prospect-sales-strategy.mjs` を採点・営業手法の正本とします。制服店との適合30点、地域支援20点、LINE等20点、小規模導入15点、掲載・連絡先15点。Sは90点以上と制服店候補・LINE掲載・到達確認HP、Aは70点以上、Bは40点以上。古い掲載や電話未確認はC・39点まで、大型売場・6拠点以上の共通運営候補は本部提案を先行してC・49点まで。これは初動の順序であり成約確率ではありません。

愛知県内の現行掲載・電話あり・5拠点以内・55点以上の専門店等から、系列・共通HP候補をまとめて上位30窓口を試験営業候補にします。元の3,177店舗を保持し、既存導入プロジェクトの店舗は新規営業対象外と表示します。名称や共通HPによる系列判定は推定です。

店舗別に郵送→電話、本部確認、現況確認等の手法、訴求、質問、電話文、次の行動、採点内訳を画面とCSVへ出力します。紹介経路がある場合は紹介を先行しますが、紹介の有無をリストから推測しません。紙運用、予約の負担、導入意向は未確認として商談の質問へ回します。予約導線確認済みの店舗には既存予約と学年別案内・会員・採寸履歴の連携を提案します。

`prospects/sales-evidence.json` は2026-09-30に追加確認した公式HPの事実と出典。店舗情報の元の取得日・SNSの確認日・営業方針の更新日は別々に表示します。全文が各店舗で重複しないよう営業文テンプレートはデータ内で共有します。

更新後の確認：

```bash
node scripts/build-prospect-directory.mjs
node scripts/verify-sales-strategy.mjs
node scripts/verify-prospects.cjs http://127.0.0.1:8766/prospects/
```
