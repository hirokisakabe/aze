/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fsNotesPlugin } from "./vite-fs-notes-plugin";

export default defineConfig(({ mode }) => {
  // '' prefix で VITE_ 以外 (AZE_NOTES_DIR 等) も含め env を読み込む。
  const env = loadEnv(mode, process.cwd(), "");
  const useFsDriver = env.VITE_STORAGE_DRIVER === "fs";

  return {
    // fs driver は dev サーバーでのみ有効。未指定時は plugin 自体を登録しないため
    // 本番ビルド / Web 配布版は従来どおり IndexedDB のまま影響を受けない。
    plugins: [react(), ...(useFsDriver ? [fsNotesPlugin({ notesDir: env.AZE_NOTES_DIR })] : [])],
    test: {
      environment: "jsdom",
      setupFiles: ["./src/__tests__/setup.ts"],
      globals: true,
      include: ["src/**/*.test.{ts,tsx}"],
      exclude: ["e2e/**"],
    },
  };
});
