import path from 'node:path';
import type { Plugin } from 'vite';
import { createFsNotesHandler, expandHome } from './src/server/fs-notes-handler';

/**
 * dev-only な filesystem notes backend (issue #78)。
 *
 * Vite の dev サーバーにのみ `/api/notes` middleware を生やし、`AZE_NOTES_DIR` が指す
 * notes ディレクトリの .md を読み書きする。fs ロジック本体は framework 非依存の
 * `src/server/fs-notes-handler.ts` (`aze serve` CLI と共有) にあり、本 plugin はそれを
 * Vite の middleware に繋ぐ薄いラッパに過ぎない。`vite build` / 本番では一切動かない。
 */
export function fsNotesPlugin(options: { notesDir?: string }): Plugin {
  const notesRoot = options.notesDir ? path.resolve(expandHome(options.notesDir)) : '';
  const handler = notesRoot ? createFsNotesHandler({ notesRoot }) : null;
  return {
    name: 'aze-fs-notes',
    configureServer(server) {
      if (!notesRoot) {
        server.config.logger.warn(
          '[aze-fs-notes] AZE_NOTES_DIR が未設定です。/api/notes は 500 を返します。'
        );
      } else {
        server.config.logger.info(`[aze-fs-notes] notes: ${notesRoot}`);
      }
      server.middlewares.use('/api/notes', (req, res) => {
        if (!handler) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'AZE_NOTES_DIR is not set' }));
          return;
        }
        void handler(req, res);
      });
      // dev サーバー停止時に file watcher を解放する (SSE 購読が残っていてもリークさせない)。
      if (handler) {
        server.httpServer?.on('close', () => handler.close());
      }
    },
  };
}
