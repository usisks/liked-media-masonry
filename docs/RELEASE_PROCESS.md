# リリース手順

バージョンの正本は `manifest.json` です。`package.json`、CHANGELOG、配布ファイル名、Gitタグ、GitHub Release名を同じ番号へ揃えます。タグ形式は `v<manifest-version>` です。

## 1. バージョン更新

機能変更の種類に応じてセマンティックバージョニングを使用します。既に同じ番号の公開Releaseがある場合は、内容を上書きせずパッチ番号を上げます。

## 2. 自動検査

```bash
npm test
npm run test:stress
npm run audit:release
```

失敗を修正して再実行し、未実施項目を成功扱いにしません。結果を `AUTOMATED_TEST_REPORT.md` に記録します。

## 3. 配布ZIPとSHA-256

```bash
npm run build:release
```

次のファイルが `dist/` に生成されます。

- `liked-media-masonry-v<version>.zip`
- `liked-media-masonry-v<version>.zip.sha256`

ZIP直下に `manifest.json` があり、`.git`、`.github`、テスト、キャッシュ、ログ、開発ツール、個人設定を含まないことを確認します。

## 4. コミットとタグ

```bash
git status
git add <公開対象ファイル>
git commit -m "build: prepare GitHub release v<version>"
git push -u origin <branch>
git tag v<version>
git push origin v<version>
```

既存タグを移動せず、force pushを使用しません。既定ブランチへ反映された公開対象コミットにタグを付けます。

## 5. GitHub Release

- タイトル: `Liked Media Masonry v<version>`
- 種別: 正式リリース
- prerelease: false
- draft: false
- Assets: ZIPとSHA-256

Release Notesには、主な変更、インストール文書、ファイル名、SHA-256、自動検査結果、実X上で未確認の項目、DOM変更リスク、非公式製品であること、既知の制限、不具合報告先を記載します。

## 6. ロールバック

問題のあるReleaseとタグを履歴改変で差し替えません。修正版を新しいパッチバージョンとして作成し、問題のあるRelease Notesへ注意事項と後継版を追記します。

Chromeウェブストア公開は、GitHub Releaseとは別工程です。
