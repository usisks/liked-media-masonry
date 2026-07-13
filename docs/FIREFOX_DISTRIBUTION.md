# Firefox・Floorp配布と自動更新

## 固定識別情報

- Gecko ID: `{6c4bffd1-76c7-4c99-ba48-367642193e15}`
- 最小Firefox version: `140.0`
- update URL: `https://usisks.github.io/liked-media-masonry/firefox/updates.json`
- 署名チャネル: AMO unlisted

Gecko IDはインストール済み拡張機能、AMO署名履歴、更新JSONを結び付けます。初回署名が成功した後は変更しません。`140.0` はFirefoxのデータ収集権限宣言をmanifestとして扱える現行ESR系を下限とするために選択しています。`strict_max_version` は設定しません。Firefox for Androidは配布対象に含めません。

## ビルド

Chrome manifestはルートの `manifest.json`、Firefox manifestは `manifests/firefox.json` が正本です。JavaScript、CSS、HTML、画像、アイコンは共有し、ビルド時に次へコピーします。

- `dist/chrome`
- `dist/firefox`

Firefox packageのルート直下に `manifest.json` を置きます。`.git`、`.github`、`node_modules`、テスト、ログ、Secrets、ローカル絶対パスを含めません。

## API互換性

実行コードは `globalThis.browser ?? globalThis.chrome` を使用します。Firefox/Floorpの `browser.*` とChrome Manifest V3のPromise対応APIで同じ非同期処理を利用し、設定は `storage.local` に保存します。`localStorage`、外部JavaScript、解析、広告、追跡、Xの非公開APIは使用しません。

## 更新JSON

トップレベルは `addons` objectで、キーは固定Gecko IDです。各エントリはversion、version付きGitHub Release asset URL、最終署名済みXPIのSHA-256、最小Firefox versionを含みます。古いversionのエントリを保持し、同じversionを重複させません。

更新JSONは署名済みXPIが公開Release assetとしてHTTP取得でき、そのSHA-256がローカル署名済みXPIと一致した後にだけ更新します。

## Secrets

Repository Secretsとして次の名前を使用します。

- `WEB_EXT_API_KEY`: AMO JWT issuer
- `WEB_EXT_API_SECRET`: AMO JWT secret

値をリポジトリ、ログ、artifact、Release Notesへ保存しません。Pull Request workflowはこれらを参照しません。

## 確認範囲

自動検証はmanifest、ビルド内容、JavaScript回帰、模擬DOM、ストレス、`web-ext lint`、署名メタデータ、公開asset再取得、SHA-256、Pages JSONまでを対象にします。実際のFirefox・Floorp上でのUI操作や旧版からの更新が未実施の場合は、エンドツーエンド確認済みとは表現しません。
