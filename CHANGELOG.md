# aze-cli

## 0.3.0

### Minor Changes

- 969d1ea: `aze --version` / `aze -V` でインストール済みの `aze-cli` のバージョンを表示できるようにしました。バージョン文字列は `package.json` の `version` をバンドル時に埋め込むため、手書きの定数で二重管理されません。

## 0.2.0

### Minor Changes

- da902f0: Node バージョンを `.node-version` (24.17.0) で一元管理し、サポート対象を Node 24 に統一しました。`package.json` の engines を `>=20` から `>=24` に引き上げています。Node 20〜23 を利用している場合は Node 24 へのアップグレードが必要です。
