import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import unusedImports from "eslint-plugin-unused-imports";
import eslintConfigPrettier from "eslint-config-prettier";

// ルールセットの意図:
// - tseslint.configs.recommendedTypeChecked: 型情報を使った検査を有効化し、
//   no-floating-promises / no-misused-promises など、非同期まわりのランタイムバグを
//   静的に検出する。型情報は parserOptions.projectService で TS から供給する。
// - eslint-plugin-import-x: import の機械的整理。順序 (import-x/order) と循環依存
//   (import-x/no-cycle) を検出し、レビューで都度指摘していたコストを lint に寄せる。
//   eslint-plugin-import 本家は ESLint 10 を peer に含まないため、ESLint 10 対応の
//   import-x を採用する。解決・名前解決系ルールは TypeScript が型チェックで担保するので
//   import-x 側では無効化する (`export =` な型定義への false positive 回避も兼ねる)。
// - eslint-plugin-unused-imports: 未使用 import を検出・自動削除する。import-x の
//   no-unused-modules は ESLint 10 で FileEnumerator API が廃止され機能しないため、
//   未使用 import 検出はこちらに寄せる (未使用変数検出も本プラグインへ一本化する)。
export default tseslint.config(
  // ビルド成果物・生成物は lint 対象外。
  {
    ignores: ["dist/", "dist-cli/", "dist-fs/"],
  },
  // 全 first-party TS/TSX 共通: 型情報ベースの検査 + import 整理。
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "bin/**/*.ts"],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
    ],
    plugins: {
      "unused-imports": unusedImports,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // React の event handler / JSX 属性には async 関数を渡せるのが慣例 (戻り値は無視される)
      // ため、JSX 属性に対する void-return 検査だけ無効化し、それ以外の誤用は検出を維持する。
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // 解決・名前解決系は TypeScript が担保するため import-x 側では無効化する。
      "import-x/no-unresolved": "off",
      "import-x/named": "off",
      "import-x/default": "off",
      "import-x/namespace": "off",
      // import 順序を builtin → external → internal → 相対 の順に機械的に揃え、
      // グループ間に空行を強制してアルファベット順に整列する (自動修正可能)。
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // 循環依存を検出する。
      "import-x/no-cycle": "error",
      // 未使用 import / 未使用変数の検出は unused-imports に一本化する
      // (no-unused-imports は自動削除も可能)。
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
    },
  },
  // React 固有ルールは SPA ソース (src) にのみ適用する。
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      ...pluginReactHooks.configs.recommended.rules,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // テストは内部状態への意図的なアクセスやモック注入で any/unbound を多用するため、
  // 型情報ベースの noisy なルールのみ緩和する (no-floating-promises 等の有用な検査は維持)。
  // テストはソースにコロケーションされ、共有ヘルパは test-support に置かれる。
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test-support/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
      // testing-library の getByRole 等やモックの `as unknown as T` キャストを
      // tsc は必要とするが本ルールは「不要」と誤判定する。auto-fix が tsc を壊すため
      // テストでは無効化する (production では有効のまま)。
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  eslintConfigPrettier,
);
