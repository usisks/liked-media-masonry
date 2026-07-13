# 自動テスト報告

## 対象

- 実行日: 2026-07-13
- バージョン: 0.16.0
- OS: Windows
- Python: 3.11.9
- Node.js: 24.18.0
- ブラウザ: Google Chrome 150.0.7871.101（headless、ローカル疑似DOM）

## 実行コマンドと結果

| コマンド | 結果 | 概要 |
| --- | --- | --- |
| `npm run audit:release` | 成功 | Chrome/Firefox manifest、権限、参照、外部通信、動的コード、アイコン |
| `npm test` | 成功 | 静的検査、content script 29件、ポップアップ1件 |
| `npm run test:stress -- --json-output tmp/stress-v0.16.0.json` | 成功 | 1,175件段階追加、5,000件規模 |
| `npm run build` | 成功 | Chrome/Firefox個別tree、決定的ZIP、開発用未署名XPI |
| `npm run lint:firefox` | 成功（警告1件） | エラー0。対象外のFirefox Android最小versionに関する警告のみ |

## 通常回帰テスト

- content scriptブラウザテスト: 29 / 29 成功
- ポップアップテスト: 1 / 1 成功
- JavaScript構文、Python構文、Chrome/Firefox manifest解析: 成功
- 画像、複数画像、縦長画像、引用投稿、動画サムネイル、遅延動画: 成功
- 設定移行、追加読込、重複防止、ライトボックス、診断情報、SPA停止・再開: 成功

## 模擬ストレステスト

### 段階追加シナリオ

- 初期収集: 600件、19.6ms
- 100件追加を5回: 各回100件を追加
- 最終件数: 1,175件
- 重複再走査による追加: 0件
- hydrate済みカード: 1件
- DOM要素数: 1,569
- video強参照: 最大3件、停止後0件
- SPA風DOM交換後のObserver再接続: 成功
- ページエラー: 0件

### 5,000件シナリオ

- 初期収集: 5,000件、133.1ms
- 重複再走査による追加: 0件
- hydrate済みカード: 28件
- DOM要素数: 5,188
- JavaScriptヒープ使用量: 8,189,972 bytes
- ページエラー: 0件

これらは同一端末のheadless Chromeと合成DOMによる測定であり、実際のX上の速度保証ではありません。

## Firefox監査

- Gecko ID: `{6c4bffd1-76c7-4c99-ba48-367642193e15}`
- 最小Firefox version: 140.0
- update URL: `https://usisks.github.io/liked-media-masonry/firefox/updates.json`
- `data_collection_permissions.required`: `["none"]`
- `web-ext lint --self-hosted`: エラー0、警告1
- 警告内容: Firefox for Android 140ではデータ収集権限宣言が未対応。Androidは配布対象外

## ローカル成果物

- Chrome ZIP: `dist/liked-media-masonry-chrome-v0.16.0.zip`
- Chrome ZIP SHA-256: `72a3a72d08de656ae99a400562aa89432553e3bc278268a793d36542fb213238`
- 開発用Firefox XPI: `dist/liked-media-masonry-firefox-floorp-v0.16.0-unsigned.xpi`
- 開発用Firefox XPI SHA-256: `59cfa26aa2797bef794e76db778e1fa1bc34774c2213a27f09f3095691799e50`

未署名XPIは構造検査専用で、正式Releaseへ添付しません。正式なFirefox SHA-256はAMO署名後の最終XPIから計算します。

## 未検証

- AMO unlisted署名（Repository Secrets未確認）
- GitHub Pages bootstrap公開
- GitHub Release v0.16.0の公開asset再取得
- 公開更新JSONと署名済みXPIのSHA-256一致
- 実際のFirefox・Floorp上での操作
- 旧版からの実際の自動更新
- 実際のX上での手動回帰テスト

これらは自動検査の成功に含めていません。
