# コントリビューションガイド

Liked Media Masonryへの改善提案を歓迎します。変更は、現行のManifest V3構成、最小権限、ブラウザ内処理という方針を維持してください。

## 開発環境

- ChromeまたはChromium
- Node.js 24 LTS
- Python 3.11以降
- Python版Playwright

依存関係を準備した後、次のコマンドで確認します。

```bash
npm test
npm run test:stress
npm run audit:release
```

## 変更前の確認

- Issueや既存文書に同じ課題がないか確認する
- `manifest.json` の権限、対象ドメイン、読み込み順を確認する
- XのDOMを固定構造とみなさず、欠損要素やSPA遷移を考慮する
- 投稿本文、利用者名、URLなどをログや診断情報へ追加しない

## ブランチとコミット

1つの変更目的ごとに短いブランチを作成し、コミットメッセージは変更内容が分かる簡潔な文にしてください。無関係な整形やリファクタリングを同じ変更へ含めないでください。

## テスト

通常の変更では `npm test` と `npm run audit:release` を実行してください。DOM抽出、追加読込、動画、Masonry表示へ影響する変更では `npm run test:stress` も実行してください。実際のX上で確認した場合は、アカウント情報を含めずに対象画面と結果をPull Requestへ記載してください。

## Manifestとプライバシー

権限、対象ドメイン、外部通信、保存データを変更するPull Requestでは、必要性と代替案を説明し、`PRIVACY.md` と `docs/PERMISSIONS.md` への影響を明記してください。外部JavaScript、解析、追跡、非公開APIへの直接アクセスは追加しないでください。

## Pull Requestに含める情報

- 変更概要と理由
- 利用者への影響
- 実行したテストと結果
- Manifest権限への影響
- プライバシーへの影響
- 既知の制限や未確認事項
