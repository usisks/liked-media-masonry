# インストールガイド

Liked Media Masonryは、GitHub Releasesで配布するZIPを展開し、Chromeのデベロッパーモードで読み込みます。Chromeウェブストア公開版ではありません。

## 1. ZIPを取得する

GitHubリポジトリのReleasesページから、次の2ファイルを取得します。

- `liked-media-masonry-v0.14.4.zip`
- `liked-media-masonry-v0.14.4.zip.sha256`

## 2. SHA-256を確認する（任意）

Windows PowerShell:

```powershell
Get-FileHash .\liked-media-masonry-v0.14.4.zip -Algorithm SHA256
Get-Content .\liked-media-masonry-v0.14.4.zip.sha256
```

macOS / Linux:

```bash
shasum -a 256 liked-media-masonry-v0.14.4.zip
cat liked-media-masonry-v0.14.4.zip.sha256
```

表示された64桁のハッシュ値が一致することを確認します。

## 3. Chromeへ読み込む

1. ZIPを任意のフォルダーへ展開します。
2. Chromeで `chrome://extensions/` を開きます。
3. 右上の「デベロッパー モード」を有効にします。
4. 「パッケージ化されていない拡張機能を読み込む」を選びます。
5. `manifest.json` が直下にある展開済みフォルダーを指定します。
6. 拡張機能一覧に「Liked Media Masonry」が表示されることを確認します。

ZIPファイル自体ではなく、展開したフォルダーを指定してください。

## 更新

1. 新しいReleaseのZIPを取得して別フォルダーへ展開します。
2. `chrome://extensions/` で既存のLiked Media Masonryを削除します。
3. 新しい展開済みフォルダーを読み込みます。

同じフォルダーを上書きした場合は、拡張機能カードの再読み込みボタンを押し、対象のXページも再読み込みしてください。

## アンインストール

`chrome://extensions/` でLiked Media Masonryの「削除」を選びます。Chromeが管理する `chrome.storage.local` の設定も削除対象になります。展開したフォルダーは必要に応じて手動で削除してください。
