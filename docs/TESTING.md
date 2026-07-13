# テスト

## 構成

- `tests/run_tests.py`: Manifest、構文、実装条件、DOMフィクスチャ、ポップアップの回帰テスト
- `tests/browser-tests.js`: content scriptのブラウザテストケース
- `tests/fixtures/`: X風の軽量DOMフィクスチャ
- `tests/run_stress_tests.py`: 段階追加と5,000件規模の模擬負荷テスト
- `tools/release_audit.py`: 権限、参照、外部通信、動的コード、ZIP内容の監査
- `tools/build_release.py`: 決定的ZIPとSHA-256の生成

## 必要環境

- Node.js 22以降
- Python 3.11以降
- Python版Playwright
- ChromeまたはChromium

## 実行コマンド

```bash
npm test
npm run test:stress
npm run test:all
npm run audit:release
npm run build:release
```

## 構文・静的検査

`npm test` は、Manifest V3、バージョン、参照ファイル、権限、対象ドメイン、content script順序を検査します。JavaScriptは `node --check`、Pythonは実行中のPythonによる `py_compile` で検査します。

本番JavaScriptに `localStorage`、`fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon` がないこと、リリース監査ではさらに `eval`、`new Function`、動的importがないことを確認します。

## 疑似DOMテスト

ローカルHTTPサーバーでテストページを開き、Chrome APIをモックしてcontent scriptを順番どおり読み込みます。画像、複数画像、縦長画像、引用投稿、動画サムネイル、遅延動画、重複防止、設定移行、追加読込、ライトボックス、診断情報、モジュール構成を確認します。

実際のXへ接続せず、利用者アカウントや投稿データを使用しません。

## ストレステスト

`npm run test:stress` は次を確認します。

- 600件から100件ずつ5回追加し、SPA風DOM交換とMutationObserver追加を含めて1,175件まで処理
- 5,000件を収集し、索引数、カード数、hydrate数、DOM数、ヒープ上限を確認
- 動画参照上限、Observer停止、追加読込停止、ライトボックス状態維持

測定値は実行環境に依存し、実際のX上の性能保証ではありません。

## ZIP検査

配布ビルド後、ZIPを再度開いて必須ファイル、不要ファイル、パストラバーサル、破損、`manifest.json` の解析とバージョン一致を確認します。SHA-256ファイルはZIPのバイト列から生成します。

## 静的プライバシー検査

リリース監査は、本番コードの外部通信API、動的コード実行、`localStorage`、削除済み機能の識別子を検索します。別途、公開前にAPIキー、トークン、Cookie、メールアドレス、秘密鍵パターンをリポジトリ全体で検査します。

## 自動化で確認できない範囲

- 実際のX上でのログイン状態別表示
- Xの段階的なDOM配信変更
- センシティブメディアや地域・年齢制限表示
- 長時間利用時の体感性能
- Chromeウェブストア審査

実X上の確認項目は `MANUAL_X_TEST_MATRIX.md` を使用し、未実施の場合はRelease Notesと `KNOWN_LIMITATIONS.md` に明記します。
