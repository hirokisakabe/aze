import { statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { createFsNotesHandler, expandHome } from '../src/server/fs-notes-handler';

/**
 * `aze serve <notes-dir>` CLI エントリ (issue #88)。
 *
 * build 済み静的 SPA (dist-fs) を軽量 Node サーバーで配信しつつ、`/api/notes` を fs
 * ハンドラ (src/server/fs-notes-handler.ts、dev plugin と共有) に繋ぐ。サーバーは
 * 127.0.0.1 のみにバインドし、意図的にローカル専用とする (ネットワーク非公開)。
 */

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4321;
const API_PREFIX = '/api/notes';

interface ServeOptions {
  notesDir: string;
  port: number;
}

function printUsage(): void {
  console.log(`aze serve <notes-dir> [--port <port>]

ローカルの Markdown ディレクトリを aze エディタで編集する (127.0.0.1 のみ・ネットワーク非公開)。

  <notes-dir>      notes ディレクトリ (~ 展開対応)
  -p, --port       待ち受けポート (default: ${DEFAULT_PORT})
  -h, --help       このヘルプを表示`);
}

function parseServeArgs(argv: string[]): ServeOptions {
  let notesDir: string | undefined;
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('-') && notesDir === undefined) {
      notesDir = arg;
    } else {
      console.error(`aze: unknown argument "${arg}"`);
      printUsage();
      process.exit(1);
    }
  }
  if (!notesDir) {
    console.error('aze: <notes-dir> is required');
    printUsage();
    process.exit(1);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`aze: invalid --port "${port}"`);
    process.exit(1);
  }
  return { notesDir, port };
}

/** req.url から `/api/notes` プレフィックスを除き、fs ハンドラが期待する相対パスにする。 */
function stripApiPrefix(url: string): string {
  const rest = url.slice(API_PREFIX.length);
  if (rest === '') return '/';
  return rest.startsWith('?') ? `/${rest}` : rest;
}

function resolveStaticDir(): string {
  // prebuilt CLI は dist-cli/aze.js として配布され、SPA は同階層の dist-fs/ に同梱される。
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../dist-fs');
}

function serve(options: ServeOptions): void {
  const notesRoot = path.resolve(expandHome(options.notesDir));
  try {
    if (!statSync(notesRoot).isDirectory()) throw new Error('not a directory');
  } catch {
    console.error(`aze: notes directory not found or not a directory: ${notesRoot}`);
    process.exit(1);
  }

  const staticDir = resolveStaticDir();
  try {
    statSync(path.join(staticDir, 'index.html'));
  } catch {
    console.error(
      `aze: SPA assets not found in ${staticDir}. "npm run build:serve" を先に実行してください。`
    );
    process.exit(1);
  }

  const notesHandler = createFsNotesHandler({ notesRoot });
  const serveStatic = sirv(staticDir, { single: true, dev: false, etag: true });

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (
      url === API_PREFIX ||
      url.startsWith(`${API_PREFIX}/`) ||
      url.startsWith(`${API_PREFIX}?`)
    ) {
      req.url = stripApiPrefix(url);
      void notesHandler(req, res);
      return;
    }
    serveStatic(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    });
  });

  // サーバー停止時に file watcher を解放する (プロセス終了時の取りこぼしを防ぐ)。
  server.on('close', () => notesHandler.close());

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`aze: port ${options.port} is already in use`);
    } else if (err.code === 'EACCES') {
      console.error(`aze: permission denied to bind ${HOST}:${options.port}`);
    } else {
      console.error(`aze: server error: ${err.message}`);
    }
    process.exit(1);
  });

  // 127.0.0.1 にのみバインドし、ネットワークへは公開しない。
  server.listen(options.port, HOST, () => {
    console.log(`aze serve → http://${HOST}:${options.port}`);
    console.log(`  notes: ${notesRoot}`);
  });
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'serve') {
    serve(parseServeArgs(rest));
    return;
  }
  if (command === undefined) {
    printUsage();
    process.exit(1);
  }
  if (command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }
  console.error(`aze: unknown command "${command}"`);
  printUsage();
  process.exit(1);
}

main();
