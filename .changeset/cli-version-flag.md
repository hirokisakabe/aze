---
'aze-cli': minor
---

`aze --version` / `aze -V` でインストール済みの `aze-cli` のバージョンを表示できるようにしました。バージョン文字列は `package.json` の `version` をバンドル時に埋め込むため、手書きの定数で二重管理されません。
