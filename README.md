# aze

ブラウザ内 Markdown ノート

## aze serve (ローカル vault エディタ)

`aze serve <vault>` で、ローカルの Markdown vault (例: Obsidian の vault) を aze の
エディタで日常編集できる。build 済みの静的 SPA を軽量 Node サーバーで配信し、`/api/notes`
を Node `fs` 経由で vault に読み書きする。**`127.0.0.1` のみにバインドし、ネットワークには
公開しない**ローカル専用のサーバー。

### インストール / 実行

npm に [`aze-cli`](https://www.npmjs.com/package/aze-cli) として公開している。SPA と CLI は
ビルド済みで同梱されるため、追加のビルド手順なしに利用できる。

```sh
# インストール不要で実行
npx aze-cli serve ~/work/me

# グローバルインストールして `aze` コマンドとして使う
npm install -g aze-cli
aze serve ~/work/me
aze serve ~/work/me --port 4321     # ポート指定 (default: 4321)
```

### ソースから動かす場合

```sh
# 初回 / 更新時にビルド (SPA と CLI の両方を生成)
npm run build:local      # = build:serve (dist-fs/) + build:cli (dist-cli/aze.js)

# 起動 (どちらでも可)
node dist-cli/aze.js serve ~/work/me
npm link && aze serve ~/work/me     # npm link で `aze` コマンドとして使う
```

- `<vault>`: vault root を positional 引数で受け取り、`~` 展開・絶対パス化する。配下の
  `.md` を再帰的に列挙して編集する。
- vault 外パスへの read/write は拒否される (vault 逸脱ガード)。
- **画像 / wikilink は未対応** (notes の read/list/create/save/delete/rename のみ)。
- `created` / `updated` は frontmatter ではなく fs の birthtime / mtime から導出する。
- 別プロセス (Claude Code 等) が vault の `.md` を編集すると、手動リロードなしで自動反映される
  (`/api/notes/events` の SSE で file watch を購読。debounce 込みで数秒以内)。

## storage driver

ノートの保存先は `VITE_STORAGE_DRIVER` で切り替えられる。未指定時は **IndexedDB** (ブラウザ内 / 本番 / テスト)。

hosted ビルド (`npm run build`) は driver ternary の tree-shake により fs コード
(`FsNotesRepository` / `/api/notes`) を一切含まない。fs driver は上記 `aze serve` (および
下記 dev-only 起動) という独立エントリにのみ存在する。

### filesystem driver (dev サーバーで使う場合)

`VITE_STORAGE_DRIVER=fs` で、ローカルの Markdown vault (例: Obsidian の vault) を直接編集できる。
Vite dev サーバーに同居する `/api/notes` middleware が Node `fs` で読み書きするため、**dev 時のみ**有効
(`vite build` / 本番では一切動かない)。

```sh
VITE_STORAGE_DRIVER=fs AZE_VAULT_PATH=~/work/me npm run dev
```

- `AZE_VAULT_PATH`: vault root。配下の `.md` を再帰的に列挙して編集する。
- 最小実験版のため **画像 / wikilink は未対応** (notes の read/list/create/save/delete/rename のみ)。
- `created` / `updated` は frontmatter ではなく fs の birthtime / mtime から導出する。
- 別プロセス (Claude Code 等) が vault の `.md` を編集すると、手動リロードなしで自動反映される
  (`/api/notes/events` の SSE で file watch を購読。debounce 込みで数秒以内)。

> 詳細・背景は [issue #78](https://github.com/hirokisakabe/aze/issues/78) を参照。
