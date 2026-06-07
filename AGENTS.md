# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + React + TypeScript application. Source files live in `src/`, with the main entry at `src/main.tsx` and app-level UI in `src/app.tsx`. Shared modules include `src/data.ts`, `src/db.ts`, `src/markdown.tsx`, and `src/sidebar.tsx`. Unit and integration tests are under `src/__tests__/`, split into `unit/` and `integration/`. Playwright tests live in `e2e/`. Build output goes to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm run dev`: start the Vite development server.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run typecheck`: run TypeScript with `--noEmit`.
- `npm run lint`: run ESLint over `src` and `e2e`.
- `npm run format`: format source and e2e files with Prettier.
- `npm run format:check`: check formatting without writing changes.
- `npm test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: run Playwright tests; it starts Vite on `E2E_PORT` or `9090`.
- `npm run knip`: check for unused files, dependencies, and exports.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Follow Prettier settings: 2-space indentation, semicolons, single quotes, `printWidth` 100, and ES5 trailing commas. ESLint forbids `any` in app and e2e code. Prefer kebab-case file names such as `sidebar.tsx`; use PascalCase for React components and camelCase for functions, variables, and hooks.

## Testing Guidelines

Use Vitest with jsdom for `src/**/*.test.{ts,tsx}`. Setup is in `src/__tests__/setup.ts`, with React Testing Library for component behavior. Keep fast logic tests in `src/__tests__/unit/`, rendered flows in `src/__tests__/integration/`, and browser workflows in `e2e/*.spec.ts`. Run `npm test`, `npm run typecheck`, and `npm run lint` before submitting; add `npm run test:e2e` for UI behavior changes.

## Commit & Pull Request Guidelines

Recent history uses short imperative commits, often Conventional Commit prefixes such as `fix:` and `feat:`. Keep commits focused and describe the user-visible change. Pull requests should summarize the change, list verification commands, and include screenshots for visual changes. PR descriptions must be written in Japanese. Only when the user explicitly provides an issue number, start the PR description with `close #<issue-number>`.

## Agent-Specific Instructions

For changing technical topics, versions, official behavior, releases, or current status, verify with WebSearch/WebFetch and cite sources using Markdown links. Do not rely only on cached knowledge for those cases.
