# aze

ローカルの Markdown vault をブラウザの aze エディタで編集する CLI。

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

### vault の扱い

- `<vault>`: vault root を positional 引数で受け取り、`~` 展開・絶対パス化する。配下の
  `.md` を再帰的に列挙して編集する。
- vault 外パスへの read/write は拒否される (vault 逸脱ガード)。
- **画像 / wikilink は未対応** (notes の read/list/create/save/delete/rename のみ)。
- `created` / `updated` は frontmatter ではなく fs の birthtime / mtime から導出する。
- 別プロセス (Claude Code 等) が vault の `.md` を編集すると、手動リロードなしで自動反映される
  (`/api/notes/events` の SSE で file watch を購読。debounce 込みで数秒以内)。
