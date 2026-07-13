# リリースチェックリスト

対象バージョン：0.16.0

## ローカル自動検査

- [x] Chrome/FirefoxともManifest V3
- [x] 権限は `storage` のみ、対象は `x.com` と `twitter.com` のみ
- [x] ChromeとFirefoxのmanifest、package versionが一致
- [x] 固定Gecko ID、固定HTTPS update URL、`data_collection_permissions: ["none"]`
- [x] `localStorage`、外部通信API、外部JavaScript、動的コードなし
- [x] 通常回帰テスト30件通過
- [x] 模擬ストレステスト：段階追加1,175件、5,000件規模
- [x] `dist/chrome` と `dist/firefox` を個別生成
- [x] Chrome ZIPと開発用未署名XPIの内容監査
- [x] `web-ext lint --self-hosted` エラー0
- [x] Firefox Android警告1件を対象外として文書化

## GitHub・Mozilla公開前提

- [ ] `WEB_EXT_API_KEY` Secretが存在
- [ ] `WEB_EXT_API_SECRET` Secretが存在
- [ ] GitHub Pages SourceがGitHub Actions
- [ ] bootstrap更新JSONがHTTP 200
- [ ] bootstrap JSONのGecko IDがmanifestと一致
- [ ] AMO unlisted署名に成功
- [ ] 署名済みXPI内manifestと署名メタデータを検証

## Releaseと自動更新

- [ ] 検証済み既定ブランチcommitへ `v0.16.0` タグを作成
- [ ] Chrome ZIP、署名済みXPI、`SHA256SUMS.txt` をdraftへ添付
- [ ] 正式Release公開後に両assetを再取得しSHA-256一致
- [ ] 公開済み署名XPIだけを更新JSONへ追加
- [ ] Pages deploy成功
- [ ] 公開JSONのversion、URL、hash、最小Firefox versionが一致
- [ ] 公開URLから再取得したXPIのSHA-256が一致

## 手動確認

- [ ] 実際のX上でChrome版を確認
- [ ] 実際のX上でFirefox版を確認
- [ ] 実際のX上でFloorp版を確認
- [ ] Esc、暗幕、前後移動、動画/GIF、追加読込、スクロール復元を確認
- [ ] 旧版から新版への自動更新を専用プロファイルで確認

現状：**ローカル自動検査済み。署名・Pages・Release・実機確認は未完了。**
