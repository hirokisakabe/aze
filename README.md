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
