# aze-cli

## 0.4.0

### Minor Changes

- c7e7d0b: editor で本文編集中に undo/redo できるようにした。通常入力に加え、Tab/Shift+Tab のインデント操作や画像 Markdown の挿入も `Cmd/Ctrl+Z` で undo、`Cmd/Ctrl+Shift+Z` / `Ctrl+Y` で redo でき、カーソル・選択範囲も復元される。

## 0.3.0

### Minor Changes

- 969d1ea: `aze --version` / `aze -V` でインストール済みの `aze-cli` のバージョンを表示できるようにしました。バージョン文字列は `package.json` の `version` をバンドル時に埋め込むため、手書きの定数で二重管理されません。

## 0.2.0

### Minor Changes

- da902f0: Node バージョンを `.node-version` (24.17.0) で一元管理し、サポート対象を Node 24 に統一しました。`package.json` の engines を `>=20` から `>=24` に引き上げています。Node 20〜23 を利用している場合は Node 24 へのアップグレードが必要です。
