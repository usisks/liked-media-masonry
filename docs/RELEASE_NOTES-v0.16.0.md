# Liked Media Masonry v0.16.0

## 概要

v0.14.4で確立したMasonryボードの表示・操作仕様を変更せず、Chrome系ブラウザ向けZIPとFirefox・Floorp向けMozilla署名済みXPIを配布するリリースです。

## 主な変更

- 拡張機能本体のJavaScript、CSS、HTMLおよび画像資産はv0.14.4の仕様を維持
- Chrome系ブラウザ向けZIPを `liked-media-masonry-chrome-v0.16.0.zip` として配布
- Firefox・Floorp向けXPIをAMO unlistedチャネルで署名して配布
- 固定Gecko IDとGitHub Pagesの固定 `update_url` による自動更新に対応
- 公開assetの再取得、SHA-256、Mozilla署名メタデータ、更新JSONを自動検証

外部解析、広告、追跡、外部JavaScript、Xの非公開APIへのアクセスは追加していません。

## 対応ブラウザ

- Chrome、Edge、Brave、Vivaldi、Opera
- Firefox Desktop 140以降
- Firefox WebExtensions互換機能を備えたFloorp

## Chrome版のインストール

`liked-media-masonry-chrome-v0.16.0.zip` を展開し、ブラウザの拡張機能管理画面から展開済みフォルダーを読み込みます。Chrome版は利用者による手動更新です。

## Firefox・Floorp版のインストール

`liked-media-masonry-firefox-floorp-v0.16.0.xpi` をGitHub Releaseから開いて追加します。公開XPIはMozilla署名済みです。Chrome ZIP、GitHubのSource code archive、開発用の未署名XPIを代用しないでください。

## Firefox・Floorp版の自動更新

初回インストール後、Firefoxは `https://usisks.github.io/liked-media-masonry/firefox/updates.json` を確認し、より新しいMozilla署名済みXPIを取得できます。更新マニフェストはGitHub Pages、XPIはバージョン固定URLのGitHub Release assetで配信します。

## Mozilla署名状態

Release workflowがAMO unlisted署名に成功し、XPI内の署名メタデータを検証した場合だけ正式Releaseへ添付します。署名に失敗した場合、Firefox向け成果物と更新JSONは公開しません。

## 自動検証結果

Release workflowはソース監査、JavaScript構文、模擬DOM回帰テスト、1,175件段階追加、5,000件ストレステスト、Chrome/Firefoxビルド、`web-ext lint`、Mozilla署名、Release asset再取得、SHA-256、Pages JSONを検証します。正式公開はこれらの成功を条件とします。

## 実機未確認事項

実際のFirefox・Floorp上でのUI操作、旧版からの自動更新、実際のX上での手動回帰テストは自動検証に含まれません。実施していない確認を実機確認済みとして扱いません。

## 既知の制限

- XのDOMや動画配信方式の変更により、検出や再生が失敗する場合があります。
- 画面に読み込まれていない投稿やメディアは取得できません。
- Floorp固有APIには依存していませんが、すべてのFloorp設定での動作は保証しません。
- 本拡張機能はX、Pinterest、Mozilla、Ablazeの公式製品ではありません。

## SHA-256

Release公開時にworkflowが最終署名済みXPIとChrome ZIPから計算した値を、このRelease Notes末尾と `SHA256SUMS.txt` へ追記します。
