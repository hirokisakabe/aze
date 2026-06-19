# Repository Guidelines

## Project Structure & Module Organization

`aze` is primarily a CLI (`aze serve`) that serves a Vite + React + TypeScript SPA over a lightweight Node server and edits a local Markdown directory through `/api/notes`. The CLI entry is `bin/aze.ts` (bundled to `dist-cli/aze.js`); the fs-driver SPA is built to `dist-fs/`; the `/api/notes` middleware lives in `vite-fs-notes-plugin.ts`. App source lives in `src/`, with the entry at `src/main.tsx` and app-level UI in `src/app.tsx`. Shared modules include `src/data.ts`, `src/db.ts`, `src/markdown.tsx`, and `src/sidebar.tsx`. Tests are colocated next to their source (e.g. `src/data.test.ts`, `src/markdown.dom.test.tsx`, `src/server/fs-notes-handler.test.ts`); shared test helpers and the jsdom setup live in `src/test-support/`. Playwright tests live in `e2e/`. Build output (`dist-cli/`, `dist-fs/`, `dist/`) is generated and should not be edited directly.

## Build, Test, and Development Commands

- `npm run dev`: start the Vite development server.
- `npm run build:local`: build both the fs-driver SPA (`dist-fs/`) and the CLI (`dist-cli/aze.js`) used by `aze serve`. `build:serve` and `build:cli` are its two halves.
- `npm run build`: create the hosted browser build in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run typecheck`: run TypeScript with `--noEmit`.
- `npm run lint`: run ESLint over `src`, `e2e`, and `bin`.
- `npm run format`: format source, e2e, and bin files with Prettier.
- `npm run format:check`: check formatting without writing changes.
- `npm test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: run Playwright tests; it starts Vite on `E2E_PORT` or `9090`.
- `npm run knip`: check for unused files, dependencies, and exports.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Follow Prettier settings: 2-space indentation, semicolons, single quotes, `printWidth` 100, and ES5 trailing commas. ESLint forbids `any` in app and e2e code. Prefer kebab-case file names such as `sidebar.tsx`; use PascalCase for React components and camelCase for functions, variables, and hooks.

## Testing Guidelines

Tests are **colocated** with the source they cover rather than gathered under a separate folder—the file's location states its responsibility (`src/server/*.test.ts` is server-side, `src/markdown.dom.test.tsx` is a component). The execution environment is encoded in the **filename suffix**, not the directory:

- `*.dom.test.{ts,tsx}` runs under **jsdom** and loads `src/test-support/setup.ts` (fake-indexeddb, jest-dom matchers). Use it for tests that render React or touch the DOM.
- `*.test.{ts,tsx}` runs under **node** with no setup file. Use it for pure logic and server/fs tests so they stay fast and free of jsdom globals.
- `*.spec.ts` under `e2e/` are Playwright browser workflows.

Vitest separates these via `test.projects` in `vite.config.ts` (a `node` project and a `jsdom` project), so `npm test` runs both. Shared fixtures and helpers live in `src/test-support/`. Use React Testing Library for component behavior. Run `npm test`, `npm run typecheck`, and `npm run lint` before submitting; add `npm run test:e2e` for UI behavior changes.

## Commit & Pull Request Guidelines

Recent history uses short imperative commits, often Conventional Commit prefixes such as `fix:` and `feat:`. Keep commits focused and describe the user-visible change. Pull requests should summarize the change, list verification commands, and include screenshots for visual changes. PR descriptions must be written in Japanese. Only when the user explicitly provides an issue number, start the PR description with `close #<issue-number>`.

## Agent-Specific Instructions

For changing technical topics, versions, official behavior, releases, or current status, verify with WebSearch/WebFetch and cite sources using Markdown links. Do not rely only on cached knowledge for those cases.
