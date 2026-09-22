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

「現在営業」は公開情報の掲載状態であり、営業中を保証しません。訪問・架電前に公式サイトまたは電話で確認します。
