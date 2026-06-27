import { realpathSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import sirv from 'sirv';

import pkg from '../package.json' with { type: 'json' };
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

/**
 * CLI のバージョン文字列。`package.json` の `version` を import してバンドル時に
 * 埋め込む (esbuild が JSON import をインライン化する)。手書きの定数で二重管理しない。
 */
export const VERSION: string = pkg.version;

interface ServeOptions {
  notesDir: string;
  port: number;
}

function printUsage(): void {
  console.log(`aze serve <notes-dir> [--port <port>]

ローカルの Markdown ディレクトリをブラウザで編集するためのサーバーを起動する。

  <notes-dir>      notes ディレクトリ (~ 展開対応)
  -p, --port       待ち受けポート (default: ${DEFAULT_PORT})
  -h, --help       このヘルプを表示`);
}

export function parseServeArgs(argv: string[]): ServeOptions {
  // 字句解析 (--port= / -p / -- 境界など) は parseArgs に委譲しつつ、未知引数の検出・
  // help 優先・--port 値欠落の扱いといった意味論は従来の左→右の評価順をそのまま保つため、
  // strict を切って tokens を自前で走査する (strict:false は未知オプションでも throw しない)。
  const { tokens } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', short: 'p' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
    tokens: true,
  });

  let notesDir: string | undefined;
  let portSeen = false;
  let portValue: string | undefined;
  for (const token of tokens) {
    if (token.kind === 'option') {
      if (token.name === 'help') {
        // --help / -h は他の引数より優先し、即座に usage を表示して正常終了する。
        printUsage();
        process.exit(0);
      } else if (token.name === 'port') {
        portSeen = true;
        portValue = token.value; // 値欠落時は undefined のまま下のバリデーションで弾く。
      } else {
        console.error(`aze: unknown argument "${token.rawName}"`);
        printUsage();
        process.exit(1);
      }
    } else if (token.kind === 'positional') {
      // 2 つ目以降の位置引数は未知引数として弾く。
      if (notesDir === undefined) {
        notesDir = token.value;
      } else {
        console.error(`aze: unknown argument "${token.value}"`);
        printUsage();
        process.exit(1);
      }
    }
    // option-terminator (`--`) は読み飛ばす (以降は positional として解釈済み)。
  }

  if (notesDir === undefined) {
    console.error('aze: <notes-dir> is required');
    printUsage();
    process.exit(1);
  }

  const port = portSeen ? Number(portValue) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`aze: invalid --port "${portValue ?? port}"`);
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

export function runCli(argv: string[]): void {
  const [command, ...rest] = argv;
  if (command === 'serve') {
    serve(parseServeArgs(rest));
    return;
  }
  if (command === '--version' || command === '-V') {
    // --version / -V はバージョンを表示して即座に正常終了する。
    console.log(VERSION);
    process.exit(0);
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

function main(): void {
  runCli(process.argv.slice(2));
}

/**
 * このモジュールが CLI エントリとして直接実行されたか判定する。
 * npm の bin symlink 経由 (entryPath が symlink パス) でも一致するよう realpath に
 * 正規化してから moduleUrl と比較する。import で読み込まれた場合 (テスト等) は
 * false となり、副作用の main() を実行しない。
 *
 * @param entryPath 実行エントリのパス (通常 process.argv[1])
 * @param moduleUrl このモジュールの URL (通常 import.meta.url)
 */
export function isCliEntry(entryPath: string | undefined, moduleUrl: string): boolean {
  if (!entryPath) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entryPath)).href;
  } catch {
    return false;
  }
}

if (isCliEntry(process.argv[1], import.meta.url)) {
  main();
}
