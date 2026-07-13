# リリース手順

バージョンは `manifest.json`、`manifests/firefox.json`、`package.json`、CHANGELOG、Release Notes、Gitタグで一致させます。既存の公開version、タグ、Gecko ID、公開済みXPIは差し替えません。

## 1. 前提

- GitHub PagesのSourceをGitHub Actionsに設定し、`Bootstrap Firefox update manifest` を一度実行する
- `https://usisks.github.io/liked-media-masonry/firefox/updates.json` がHTTP 200で正しいJSONを返す
- AMO API資格情報をRepository Secrets `WEB_EXT_API_KEY` と `WEB_EXT_API_SECRET` に登録する
- Gecko ID `{6c4bffd1-76c7-4c99-ba48-367642193e15}` を変更しない
- `web-ext sign --channel=unlisted` を使用する

Secretの値はログ、成果物、Issue、Pull Requestへ出力しません。fork由来のPull RequestへSecretを渡しません。

## 2. ローカル検証

```bash
npm ci
python -m pip install -r requirements-dev.txt
npm run audit:release
npm run test:all
npm run build
npm run lint:firefox
```

生成先は `dist/chrome` と `dist/firefox` です。`liked-media-masonry-firefox-floorp-vVERSION-unsigned.xpi` は構造検証専用で、正式Releaseへ添付しません。

## 3. Pull RequestとPages bootstrap

変更を作業ブランチへpushし、CI成功後に既定ブランチへマージします。初回だけGitHub PagesをGitHub Actions方式で有効にし、`Bootstrap Firefox update manifest` を手動実行して空の正しい更新JSONを公開します。

bootstrap URLがHTTP 200になる前にFirefox XPIを署名・公開しません。

## 4. タグと自動Release

既定ブランチの検証済みcommitへ `vVERSION` タグを作成してpushします。`.github/workflows/release.yml` が次を順番に実行します。

1. tag、全manifest、packageのversion一致を検査
2. Pages bootstrapとAMO Secretsの存在を検査
3. テスト、Chrome/Firefoxビルド、`web-ext lint`
4. Firefox packageをAMO unlistedで署名
5. 署名メタデータとXPI内manifestを検査
6. draft ReleaseへChrome ZIP、署名済みXPI、`SHA256SUMS.txt`を添付
7. Releaseを公開し、公開URLから両成果物を再取得してSHA-256を照合
8. 公開済み署名XPIだけを更新JSONへ追加してPagesをdeploy
9. 公開Pages JSONと公開XPIを再取得し、Gecko ID、version、URL、最小Firefox version、SHA-256を照合

`update_link` は `latest/download` を使わず、tagとversionを含む不変URLです。

## 5. 失敗時の復旧

- 署名前の失敗: Releaseと更新JSONを作らず、原因を修正して再実行する
- draft Release中の失敗: 同じdraftを再利用できる。公開済みReleaseのassetは上書きしない
- Pages失敗: 公開済みの旧更新JSONを維持する。新Releaseは手動インストール可能でも、自動更新完了とは報告しない
- 公開XPIとhashの不一致: 更新JSONをdeployしない。同じversionを差し替えず、新しいpatch versionで修正する
- AMO ID競合: 初回署名前に限り新しい固定IDへ変更し、manifest、bootstrap JSON、文書を同時に更新する

問題のある公開Releaseやタグを履歴改変で差し替えません。修正版はより高いversionで公開します。
