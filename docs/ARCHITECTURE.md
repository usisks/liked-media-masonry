# アーキテクチャ

## ディレクトリ構成

```text
manifest.json          Manifest V3設定とcontent script読込順
content.css            ページ上へ表示するボードとライトボックスのスタイル
content/               content scriptの役割別モジュール
popup.html/js/css      ツールバーの操作・設定UI
icons/                 Chrome拡張機能アイコン
tests/                 静的検査、DOMフィクスチャ、ブラウザ回帰、ストレステスト
tools/                 リリース監査と決定的ZIP生成
docs/                  利用・設計・テスト・公開文書
```

## Manifest構成

`manifest.json` はManifest V3です。権限は `storage` のみで、content scriptは `https://x.com/*` と `https://twitter.com/*` に限定しています。外部スクリプト、background service worker、web accessible resourcesは使用していません。

content scriptは次の順で読み込まれます。

1. `content/namespace.js`
2. `content/settings.js`
3. `content/diagnostics.js`
4. `content/dom.js`
5. `content/video.js`
6. `content/board.js`
7. `content/lightbox.js`
8. `content/loading.js`
9. `content/routing.js`
10. `content/main.js`

## 初期化

`namespace.js` が `globalThis.__LIKED_MEDIA_MASONRY__` を作成し、共有状態、定数、モジュール登録領域を保持します。各ファイルはこの名前空間へAPIを登録し、`main.js` がページ判定、初期設定読込、UI作成、監視開始をまとめます。

## 設定読込

`settings.js` は `globalThis.browser ?? globalThis.chrome` を通じて拡張機能の `storage.local` を利用します。保存キーは `liked-media-masonry-settings-v2` です。旧キーがある場合は対応する値だけを移行し、廃止済み設定は残しません。保存失敗時は既定値で継続します。

## XのDOMからのメディア抽出

`dom.js` は `article[data-testid="tweet"]` を中心に、画像、動画サムネイル、投稿URL、投稿者表示、投稿日を読み取ります。メディア識別子は投稿status IDと正規化したメディアパスを組み合わせ、クエリーサイズ違いによる重複を防ぎます。

DOM要素が欠ける場合は取得できた項目だけを使用します。Xの非公開APIへ問い合わせず、ページが既に読み込んだDOMとResource Timingだけを参照します。

## カード生成と重複防止

`board.js` は収集項目、キー索引、メディアパス索引、カード位置をMapで管理します。画面外のカードでは画像・動画など重い内容を解放し、必要になった時に再構築します。カード外枠はDOM上に残るため、完全仮想スクロールではありません。

## Masonryレイアウト

ボード幅と設定されたカード幅から列数を決め、各列の高さを比較して次のカードを最短列へ配置します。画像の縦横比を使用し、縦長画像を固定高さで切りません。リサイズ時は配置を再計算します。

## MutationObserver

`routing.js` とDOM処理は、Xのタイムラインへ追加された `addedNodes` を中心に走査します。SPA遷移でタイムラインのルートが交換された場合は監視対象を付け直し、既存UIの重複生成を防ぎます。

## IntersectionObserver

カードの表示範囲を監視し、近傍だけをhydrateします。画面外へ出たカードは遅延キューでまとめて解放し、スクロール中のDOM更新回数を抑えます。

## ライトボックス

`lightbox.js` は現在のメディアキーを保持し、前後移動、左右プレビュー、キーボード操作、フォーカス復元、背景ボードのスクロールを処理します。最初と最後を越えるループは行いません。

## 動画要素の借用と復元

`video.js` は次の優先順で再生経路を選びます。

1. DOMまたはResource Timingで確認できる `video.twimg.com` のMP4 URL
2. `blob:` または `srcObject` を持つXのvideo要素の一時借用
3. サムネイルと元投稿リンクへのフォールバック

借用前の親要素と位置を記録し、終了時に元へ戻します。再生セッションごとに `AbortController` を作成し、移動や終了時にイベントとタイマーを停止します。強参照するvideo要素は最大3件です。

## 追加読込

`loading.js` のLoadControllerは `idle`、`requesting`、`waiting_for_x`、`collecting`、`cooldown`、`failed` の状態を持ちます。利用者の操作条件、重複実行防止、連続空振り、キャンセル、X本体のスクロール位置復元を一か所で管理します。

## SPA遷移

`routing.js` はURLとタイムラインルートの変化を確認します。「いいね」ページを離れた場合はObserver、読込処理、動画参照、UI状態を停止し、戻った時に再初期化します。
