---
'aze-cli': minor
---

Node バージョンを `.node-version` (24.17.0) で一元管理し、サポート対象を Node 24 に統一しました。`package.json` の engines を `>=20` から `>=24` に引き上げています。Node 20〜23 を利用している場合は Node 24 へのアップグレードが必要です。
