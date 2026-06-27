# aze

[![npm version](https://img.shields.io/npm/v/aze-cli.svg)](https://www.npmjs.com/package/aze-cli)

ローカルの Markdown ディレクトリをブラウザで編集する CLI ツール。

## 必要環境

- Node.js 24 以上

## 使い方

`aze serve <notes>` でローカルサーバーが起動し、ブラウザ上のエディタでそのディレクトリの Markdown を編集できる。

```sh
npx aze-cli serve ./notes
npx aze-cli serve ./notes --port 4321     # ポート指定 (default: 4321)
```

## 特徴

- 指定したディレクトリ配下の `.md` を再帰的に一覧・編集できる。
- 編集できるのは指定ディレクトリの中だけで、外のファイルには触れない。
- 他のアプリやエディタ (Claude Code 等) でファイルを編集すると、リロードなしで数秒以内に自動反映される。
- Markdown の相対リンクで `.md` ノート間を移動できる。
- 画像は `assets/` 配下の実ファイルとして保存され、Markdown から相対パスで参照される。
- **wikilink は未対応**。
