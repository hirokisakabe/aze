# コントリビューションガイド

## リリースフロー (changesets)

`aze-cli` のバージョン採番・CHANGELOG 生成・npm への publish は [changesets](https://github.com/changesets/changesets) で自動化している。

### 変更を加える PR では changeset を添付する

ユーザーに見える変更 (機能追加・修正など) を含む PR には、`npx changeset` で changeset を添付すること。

```sh
npx changeset
```

対話に従って bump の種類 (major / minor / patch) と変更内容の要約を入力すると、`.changeset/` 配下に Markdown ファイルが生成される。これをコミットして PR に含める。

- ドキュメントのみ・CI 設定のみなど、リリースに含めなくてよい変更では changeset は不要。
- 変更の要約はそのまま CHANGELOG に転記されるため、利用者目線で記述する。

### publish の流れ

1. changeset を含む PR を `main` にマージする。
2. `.github/workflows/release.yml` (Release ワークフロー) が `main` への push を契機に走り、未消化の changeset があれば **「Version Packages」PR** を自動生成する。この PR は `package.json` のバージョンと `CHANGELOG.md` を更新する。
3. 「Version Packages」PR をマージすると、再び Release ワークフローが走り `changeset publish` (= `npm publish`) で npm に公開される。
4. publish 時に `prepublishOnly` (`npm run build:local`) が走り、`dist-cli/` と `dist-fs/` がビルドされた状態でパッケージに含まれる。

### 認証 (npm OIDC Trusted Publishing)

publish には npm の [OIDC Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) を使う。`NPM_TOKEN` を持たずに publish でき、provenance も自動付与される。

- Release ワークフローは Node.js 22.14.0 以上を使い、npm を 11.5.1 以上に更新したうえで publish する (OIDC の必須要件)。
- publish ジョブには `NODE_AUTH_TOKEN` / `NPM_TOKEN` を一切渡さない。空のトークンがあると npm が OIDC ではなくトークン認証を試みて失敗するため。

#### 初回セットアップ (実施済み / 再設定時の参考)

OIDC では初回 publish ができない ([npm/cli#8544](https://github.com/npm/cli/issues/8544)) ため、最初の 1 回 (v0.1.0) はローカルから手動で publish する。

```sh
npm publish
```

> provenance は cloud-hosted CI からの publish が前提で、ローカル手動 publish では付与できない。初回はローカルの通常 publish で構わない。2 回目以降は Release ワークフロー (OIDC) から publish され、provenance も自動付与される。

その後、npmjs の Web UI で `aze-cli` パッケージに **Trusted Publisher** を登録する。

- リポジトリ: `hirokisakabe/aze`
- ワークフローファイル名: `release.yml` (npm UI にはフルパスではなくファイル名のみを入力する)

これ以降のバージョンは Release ワークフローから OIDC で自動 publish される。

### パッケージ内容の確認

publish 前にパッケージへ含まれるファイル (`dist-cli/`, `dist-fs/` のみ) を確認できる。

```sh
npm run build:local
npm publish --dry-run
```
