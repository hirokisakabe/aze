# aze-cli

## 0.5.2

### Patch Changes

- 5d6bece: Markdown プレビュー内の h3 / h4 見出しとリンクの色を調整し、読み取りやすさを改善しました。
- c5eadde: Markdown プレビューで標準 Markdown の相対リンクからノート間を移動できるようにしました。

## 0.5.1

### Patch Changes

- 9bc6f20: 左サイドバーのファイル/ディレクトリ項目からパスをコピーできるようにしました。
- 9f6a13c: CLI ヘルプの説明文を、aze をエディタ名として重ねて呼ばない表現に修正。
- ff09137: ノート詳細画面上部の divider を減らし、metadata と本文見出しの情報階層を余白と薄い罫線で整理しました。

## 0.5.0

### Minor Changes

- 418b11e: Show the currently mounted notes directory in the filesystem editor UI and browser title.

### Patch Changes

- 2d3ba02: fs driver (`aze serve`) で画像を notes ディレクトリ配下の実ファイルとして保存し、Markdown の相対パス参照でプレビュー表示できるようにしました。

## 0.4.0

### Minor Changes

- c7e7d0b: editor で本文編集中に undo/redo できるようにした。通常入力に加え、Tab/Shift+Tab のインデント操作や画像 Markdown の挿入も `Cmd/Ctrl+Z` で undo、`Cmd/Ctrl+Shift+Z` / `Ctrl+Y` で redo でき、カーソル・選択範囲も復元される。

## 0.3.0

### Minor Changes

- 969d1ea: `aze --version` / `aze -V` でインストール済みの `aze-cli` のバージョンを表示できるようにしました。バージョン文字列は `package.json` の `version` をバンドル時に埋め込むため、手書きの定数で二重管理されません。

## 0.2.0

### Minor Changes

- da902f0: Node バージョンを `.node-version` (24.17.0) で一元管理し、サポート対象を Node 24 に統一しました。`package.json` の engines を `>=20` から `>=24` に引き上げています。Node 20〜23 を利用している場合は Node 24 へのアップグレードが必要です。
