# Liked Media Masonry v0.14.4

Xの「いいね」ページに読み込まれた画像・動画・GIFをMasonryボードで閲覧するManifest V3 Chrome拡張機能のGitHub公開版です。

## 主な変更

- 役割別content script、追加読込、動画セッション、SPA遷移処理を公開用に文書化
- 1,175件の段階追加と5,000件規模の模擬ストレステストを実施
- プライバシー、権限、セキュリティ、サポート、リリース文書を整備
- 許可リスト方式の配布ZIPとSHA-256生成を追加
- WindowsでのPythonテスト呼び出しを修正

## インストール

[インストールガイド](INSTALL.md) に従い、ZIPを展開して `chrome://extensions/` から読み込んでください。Chromeウェブストア公開版ではありません。

## 配布ファイル

- `liked-media-masonry-v0.14.4.zip`
- `liked-media-masonry-v0.14.4.zip.sha256`

SHA-256:

```text
751b25ce3f6de022b7668d3315c84e12215faa7eeaa11d35eb3ab0c7e07ce238  liked-media-masonry-v0.14.4.zip
```

## 検証

Manifest、JavaScript/Python構文、content script 29件、ポップアップ1件、1,175件の段階追加、5,000件規模、権限、外部通信パターン、ZIP内容を自動検査し、すべて合格しました。リリース監査の警告は、128pxアイコンに透明余白がない点です。詳細は [自動テスト報告](AUTOMATED_TEST_REPORT.md) を参照してください。

実際のX上での手動回帰テスト、Chromeへの手動導入確認、目視確認は本自動検査には含まれません。

## 注意事項

- XのDOMや動画配信方式が変わると動作しなくなる可能性があります。
- 本拡張機能はXまたはPinterestの公式製品ではありません。
- [既知の制限](KNOWN_LIMITATIONS.md) を確認してください。
- 不具合は [サポート案内](../SUPPORT.md) に従って報告してください。
