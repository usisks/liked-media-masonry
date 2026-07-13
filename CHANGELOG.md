# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に近い形式で、公開版の主な変更を記録します。バージョン番号は `manifest.json` を正本とします。

## [0.16.0] - 2026-07-13

### Changed

- v0.14.4で確立したMasonryボード、ライトボックス、動画・GIF、追加読込、スクロール復元の動作仕様を維持したまま配布版を更新
- Chrome系ブラウザ向けZIPと、Firefox 140以降・対応するFloorp向けMozilla署名済みXPIを同一Releaseで配布

### Security

- Mozilla AMO unlisted署名、公開asset再取得、SHA-256一致、GitHub Pages更新マニフェストの検証を正式Releaseの必須条件として継続

## [0.15.0] - 2026-07-13

### Added

- Firefox DesktopとFloorp向けのManifest V3 WebExtensions互換ビルド
- 固定Gecko ID、固定HTTPS `update_url`、データ非収集宣言を含むFirefox manifest
- AMO unlisted署名、GitHub Release、GitHub Pages更新マニフェストを連携するリリースワークフロー
- Chrome/Firefox個別ビルド、`web-ext lint`、署名メタデータ、更新JSON、公開XPIのSHA-256検証

### Changed

- Chrome ZIP名を `liked-media-masonry-chrome-vVERSION.zip` に統一
- 共有ソースから `dist/chrome` と `dist/firefox` を生成するクロスブラウザ構成へ変更
- 設定保存APIの説明を `globalThis.browser ?? globalThis.chrome` と `storage.local` に統一

### Security

- GitHub Actionsを公式actionの完全なcommit SHAへ固定
- 未署名XPIを正式Releaseへ添付せず、署名後のasset公開・再取得・ハッシュ一致後にだけ更新JSONへ追加

## [0.14.4] - 2026-07-13

### Added

- 1,175件の段階追加と5,000件規模を対象にした模擬ストレステスト
- GitHub公開、利用、権限、テスト、リリースに関する文書
- 決定的な配布ZIPとSHA-256チェックサムの生成

### Changed

- content scriptを役割別モジュールとして読み込む構成を文書化
- 配布ZIPを実行に必要な許可リスト方式で作成

### Fixed

- Windowsを含む環境で、テスト内部のPython呼び出しに実行中のPythonを使用
- 動画再生セッション切替時の後処理、追加読込の重複防止、DOM再接続の回帰検証を追加

### Removed

- センシティブ投稿だけを表示する設定・UI・状態・条件分岐

### Security

- 診断情報を固定許可リストで生成し、投稿本文、利用者名、URL、生のエラーメッセージを除外
- 外部通信API、動的コード実行、`localStorage` の混入をリリース監査で検査
