# Liked Media Masonry v0.15.0

## 概要

Firefox DesktopとFloorp向けのFirefox WebExtensions互換版、Mozilla署名、GitHub Pages経由の自動更新基盤を追加します。Chrome系ブラウザ向けの既存機能と手動更新方式は維持します。

## 主な変更

- Chrome/Firefox別manifestと共有ソースからの個別ビルド
- 固定Gecko IDと固定HTTPS `update_url`
- `data_collection_permissions.required: ["none"]` による外部データ収集なしの宣言
- AMO unlisted署名済みXPIのGitHub Releases配布
- 公開済み署名XPIだけを参照するGitHub Pages更新JSON
- 公開asset再取得、SHA-256、`web-ext lint`、更新JSONの自動検証

外部解析、広告、追跡、外部JavaScript、Xの非公開APIは追加していません。

## 対応ブラウザ

- Chrome、Edge、Brave、Vivaldi、Opera
- Firefox Desktop 140以降
- Firefox WebExtensions互換版を実行できるFloorp

## Chrome版のインストール

`liked-media-masonry-chrome-v0.15.0.zip` を展開し、ブラウザの拡張機能管理画面から展開済みフォルダーを読み込みます。Chrome版は利用者による手動更新です。

## Firefox・Floorp版のインストール

`liked-media-masonry-firefox-floorp-v0.15.0.xpi` をGitHub Releaseから開いて追加します。公開XPIはMozilla署名済みです。Chrome ZIP、GitHubのSource code archive、開発用の未署名XPIを代用しないでください。

## Firefox・Floorp版の自動更新

初回インストール後、Firefoxは `https://usisks.github.io/liked-media-masonry/firefox/updates.json` を確認し、より高いversionのMozilla署名済みXPIを取得できます。更新マニフェストはGitHub Pages、XPIはversion付き不変URLのGitHub Release assetで配信します。

## Mozilla署名状態

Release workflowがAMO unlisted署名に成功し、XPI内の署名メタデータを検査した場合だけ正式Releaseへ添付します。署名に失敗した場合、Firefox用成果物と更新JSONは公開しません。

## 自動検証結果

Release workflowはソース監査、JavaScript構文、模擬DOM回帰テスト、1,175件段階追加、5,000件ストレステスト、Chrome/Firefoxビルド、`web-ext lint`、Mozilla署名、Release asset再取得、SHA-256、Pages JSONを検証します。正式Releaseの公開はこれらのworkflow成功を条件とします。

## 実機未確認事項

実際のFirefox・Floorp上でのUI操作と旧版からの自動更新は、この自動検証には含まれません。実施していない確認を実機確認済みとは扱いません。

## 既知の制限

- XのDOMや動画配信方式の変更により、抽出や再生が失敗する場合があります。
- 画面へ読み込まれていない投稿やメディアは取得できません。
- Floorp固有APIには依存していませんが、すべてのFloorp設定での動作は保証しません。
- 本拡張機能はX、Pinterest、Mozilla、Ablazeの公式製品ではありません。

## SHA-256

Release公開時にworkflowが最終署名済みXPIとChrome ZIPから計算した値を、このRelease Notes末尾と `SHA256SUMS.txt` へ追記します。
