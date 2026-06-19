# aze

ブラウザ内 Markdown ノート

## storage driver

ノートの保存先は `VITE_STORAGE_DRIVER` で切り替えられる。未指定時は **IndexedDB** (ブラウザ内 / 本番 / テスト)。

### filesystem driver (実験的 / dev-only)

`VITE_STORAGE_DRIVER=fs` で、ローカルの Markdown vault (例: Obsidian の vault) を直接編集できる。
Vite dev サーバーに同居する `/api/notes` middleware が Node `fs` で読み書きするため、**dev 時のみ**有効
(`vite build` / 本番では一切動かない)。

```sh
VITE_STORAGE_DRIVER=fs AZE_VAULT_PATH=~/work/me npm run dev
```

- `AZE_VAULT_PATH`: vault root。配下の `.md` を再帰的に列挙して編集する。
- 最小実験版のため **画像 / wikilink は未対応** (notes の read/list/create/save/delete/rename のみ)。
- `created` / `updated` は frontmatter ではなく fs の birthtime / mtime から導出する。
- 別プロセス (Claude Code 等) が編集した場合、リロードするまで反映されない (auto-reload 未実装)。

> 詳細・背景は [issue #78](https://github.com/hirokisakabe/aze/issues/78) を参照。
