# 制服店専用LINEアプリ

制服店向けLINEアプリの営業用ランディングページです。

- 公開ページ: https://makoban.github.io/uniform-line-lp/
- 営業候補一覧: https://makoban.github.io/uniform-line-lp/prospects/
- PC・スマートフォン別の生成画像をレスポンシブ配信
- 検索エンジンの登録対象外とする `noindex` 設定

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
