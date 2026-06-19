import { realpathSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

export function parseServeArgs(argv: string[]): ServeOptions {
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
export function stripApiPrefix(url: string): string {
  const rest = url.slice(API_PREFIX.length);
  if (rest === '') return '/';
  return rest.startsWith('?') ? `/${rest}` : rest;
}

function resolveStaticDir(): string {
  // prebuilt CLI は dist-cli/aze.js として配布され、SPA は同階層の dist-fs/ に同梱される。
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../dist-fs');
}

/**
 * notes ディレクトリが存在し実ディレクトリであることを検証する。
 * 問題があればユーザー向けエラーメッセージを、正常なら null を返す。
 */
export function validateNotesDir(notesRoot: string): string | null {
  try {
    if (!statSync(notesRoot).isDirectory()) throw new Error('not a directory');
  } catch {
    return `aze: notes directory not found or not a directory: ${notesRoot}`;
  }
  return null;
}

/**
 * SPA の build 成果物 (index.html) が staticDir に存在することを検証する。
 * 無ければユーザー向けエラーメッセージを、正常なら null を返す。
 */
export function validateSpaBuilt(staticDir: string): string | null {
  try {
    statSync(path.join(staticDir, 'index.html'));
  } catch {
    return `aze: SPA assets not found in ${staticDir}. "npm run build:serve" を先に実行してください。`;
  }
  return null;
}

/** server の 'error' イベントが持つ errno code を CLI 向けのメッセージへ変換する。 */
export function serverErrorMessage(err: NodeJS.ErrnoException, host: string, port: number): string {
  if (err.code === 'EADDRINUSE') return `aze: port ${port} is already in use`;
  if (err.code === 'EACCES') return `aze: permission denied to bind ${host}:${port}`;
  return `aze: server error: ${err.message}`;
}

export function serve(options: ServeOptions): void {
  const notesRoot = path.resolve(expandHome(options.notesDir));
  const notesError = validateNotesDir(notesRoot);
  if (notesError) {
    console.error(notesError);
    process.exit(1);
  }

  const staticDir = resolveStaticDir();
  const spaError = validateSpaBuilt(staticDir);
  if (spaError) {
    console.error(spaError);
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
    console.error(serverErrorMessage(err, HOST, options.port));
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

/**
 * このモジュールが CLI エントリとして直接実行されたか判定する。
 * npm の bin symlink 経由 (process.argv[1] が symlink パス) でも一致するよう
 * realpath に正規化してから import.meta.url と比較する。import で読み込まれた
 * 場合 (テスト等) は false となり、副作用の main() を実行しない。
 */
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  main();
}
