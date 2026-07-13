# インストールガイド

Liked Media MasonryはGitHub Releasesから配布します。Chrome系は展開して読み込むZIP、Firefox・FloorpはMozilla署名済みXPIを使用します。

## Chrome・Edge・Brave・Vivaldi・Opera

1. Releaseから `liked-media-masonry-chrome-v0.16.0.zip` と `SHA256SUMS.txt` を取得します。
2. SHA-256を確認し、ZIPを任意のフォルダーへ展開します。
3. ブラウザの拡張機能管理画面を開き、デベロッパーモードを有効にします。
4. 「パッケージ化されていない拡張機能を読み込む」を選び、`manifest.json` が直下にある展開済みフォルダーを指定します。

Chromeの場合は `chrome://extensions/`、Edgeの場合は `edge://extensions/` を使用します。ZIP自体を指定しないでください。

Chrome系の更新は、新しいZIPを取得して展開し、拡張機能を再読み込みする手動方式です。

## Firefox・Floorp

1. Releaseから `liked-media-masonry-firefox-floorp-v0.16.0.xpi` と `SHA256SUMS.txt` を取得します。
2. SHA-256を確認します。
3. FirefoxまたはFloorpでXPIへのRelease assetリンクを開き、確認画面から追加します。
4. `about:addons` にLiked Media Masonryが表示されることを確認します。

正式なFirefox用成果物はMozillaがAMO unlistedチャネルで署名したXPIです。Chrome ZIP、GitHubの自動生成Source code archive、ファイル名に `-unsigned.xpi` を含む開発用XPIはインストール対象ではありません。

通常版Firefox・Floorpでは、署名済みXPIは再起動後も維持されます。一時的なデバッグ読み込みとは異なります。

## Firefox・Floorpの自動更新

初回インストール後は、XPI内の固定 `update_url` からGitHub Pages上の更新JSONをFirefoxが確認します。更新JSONが現在より高いversionのMozilla署名済みXPIを示す場合、そのXPIが更新候補になります。

手動で確認する場合は `about:addons` を開き、歯車メニューから「更新を確認」を選びます。更新確認の表示や適用時期はFirefox・Floorpの設定に依存します。

## SHA-256の確認

Windows PowerShell:

```powershell
Get-FileHash .\liked-media-masonry-chrome-v0.16.0.zip -Algorithm SHA256
Get-FileHash .\liked-media-masonry-firefox-floorp-v0.16.0.xpi -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

macOS / Linux:

```bash
sha256sum liked-media-masonry-chrome-v0.16.0.zip
sha256sum liked-media-masonry-firefox-floorp-v0.16.0.xpi
cat SHA256SUMS.txt
```

## アンインストール

ブラウザの拡張機能管理画面でLiked Media Masonryを削除します。ブラウザが管理する `storage.local` の設定も削除対象になります。Chrome系で展開したフォルダーは必要に応じて手動で削除してください。
