import path from 'node:path';
import type { Plugin } from 'vite';
import { createFsNotesHandler, expandHome } from './src/server/fs-notes-handler';

/**
 * dev-only な filesystem notes backend (issue #78)。
 *
 * Vite の dev サーバーにのみ `/api/notes` middleware を生やし、`AZE_VAULT_PATH` が指す
 * vault の .md を読み書きする。fs ロジック本体は framework 非依存の
 * `src/server/fs-notes-handler.ts` (`aze serve` CLI と共有) にあり、本 plugin はそれを
 * Vite の middleware に繋ぐ薄いラッパに過ぎない。`vite build` / 本番では一切動かない。
 */
export function fsNotesPlugin(options: { vaultPath?: string }): Plugin {
  const vaultRoot = options.vaultPath ? path.resolve(expandHome(options.vaultPath)) : '';
  const handler = vaultRoot ? createFsNotesHandler({ vaultRoot }) : null;
  return {
    name: 'aze-fs-notes',
    configureServer(server) {
      if (!vaultRoot) {
        server.config.logger.warn(
          '[aze-fs-notes] AZE_VAULT_PATH が未設定です。/api/notes は 500 を返します。'
        );
      } else {
        server.config.logger.info(`[aze-fs-notes] vault: ${vaultRoot}`);
      }
      server.middlewares.use('/api/notes', (req, res) => {
        if (!handler) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'AZE_VAULT_PATH is not set' }));
          return;
        }
        void handler(req, res);
      });
    },
  };
}
