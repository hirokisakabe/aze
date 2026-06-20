import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createNotesWatcher, type NotesWatcher } from './notes-watcher';

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * filesystem notes backend の framework 非依存ハンドラ。
 *
 * `AZE_NOTES_DIR` が指す notes ディレクトリの .md を Node `fs` で読み書きする中核ロジックで、
 * Vite dev サーバー (vite-fs-notes-plugin) と `aze serve` CLI (bin/aze.ts) の双方が
 * これを共有する。req/res は `node:http` 互換であれば足り、Vite にも CLI にも依存しない。
 *
 * API (いずれも `/api/notes` mount 後の相対パスで受ける):
 * - `GET    /`              → { notes: Note[] }  (notes ディレクトリ配下の .md を再帰列挙)
 * - `GET    /one?path=...`  → { note: Note } | 404
 * - `PUT    /one`           → { note: Note }     (body: Note。作成 or 上書き)
 * - `DELETE /one?path=...`  → { ok: true }
 * - `POST   /rename`        → { ok: true }       (body: { oldPath, newPath })
 * - `GET    /events`        → text/event-stream  (外部からのファイル編集の auto-reload 用 SSE。issue #87)
 *
 * 制約:
 * - 画像 / wikilink は未対応 (notes のみ)。
 * - created/updated は frontmatter ではなく fs の birthtime / mtime から導出する。
 *   title: frontmatter との統一は issue #78 の「詰めるべき点」として後回し。
 */

interface FsNote {
  path: string;
  created: string;
  updated: string;
  body: string;
}

const IGNORED_DIRS = new Set(['node_modules']);
const dateFormat = new Intl.DateTimeFormat('sv-SE');

/** 先頭の `~` をホームディレクトリに展開する。CLI / plugin の notes ディレクトリ指定で共有する。 */
export function expandHome(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function toDateString(d: Date): string {
  return dateFormat.format(d);
}

/** rel が notes ディレクトリ配下の .md を指すことを保証する。逸脱したら null。 */
export function resolveInNotesDir(
  notesRoot: string,
  rel: string | null | undefined
): string | null {
  if (!rel || !rel.endsWith('.md')) return null;
  // API の契約は「notes ディレクトリ相対パス」。絶対パスは path.resolve が notesRoot を無視して
  // しまい、たまたま notes ディレクトリ内を指すと note.path に絶対パスが混入するため明示的に弾く。
  if (path.isAbsolute(rel)) return null;
  const abs = path.resolve(notesRoot, rel);
  if (abs !== notesRoot && !abs.startsWith(notesRoot + path.sep)) return null;
  return abs;
}

/** request body を JSON object としてパースする。不正なら null (= 呼び出し側で 400)。 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * request body を JSON object としてパースし、指定 key がすべて string であることを検証する。
 * パース失敗 / object でない / いずれかの key が非 string の場合は null (= 呼び出し側で 400)。
 * 各エンドポイントに散らばっていた `typeof x !== 'string'` の手書きバリデーションをここに集約する。
 */
async function readJsonStringFields<K extends string>(
  req: IncomingMessage,
  keys: readonly K[]
): Promise<Record<K, string> | null> {
  const payload = parseJsonObject(await readBody(req));
  if (!payload) return null;
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== 'string') return null;
    out[key] = value;
  }
  return out;
}

async function listMarkdown(notesRoot: string, dir = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(notesRoot, dir), { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listMarkdown(notesRoot, rel)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

async function readNote(notesRoot: string, rel: string): Promise<FsNote> {
  const abs = path.join(notesRoot, rel);
  const [body, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
  const birth = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
  return {
    path: rel,
    created: toDateString(birth),
    updated: toDateString(stat.mtime),
    body,
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * 1 エンドポイントの処理に必要な値をまとめた context。各ハンドラは必要な field だけ
 * 分割代入で受け取る (未使用引数を避ける)。`url` は handle() でパース済みのものを共有する。
 */
interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  notesRoot: string;
  url: URL;
}

type RouteHandler = (ctx: RouteContext) => Promise<void>;

/** GET / : notes ディレクトリ配下の .md を再帰列挙する。 */
async function listNotes({ res, notesRoot }: RouteContext): Promise<void> {
  const rels = await listMarkdown(notesRoot);
  const notes = await Promise.all(rels.map((rel) => readNote(notesRoot, rel)));
  sendJson(res, 200, { notes });
}

/** GET /one?path= : 単一 note を返す。存在しなければ 404。 */
async function getNote({ res, notesRoot, url }: RouteContext): Promise<void> {
  const rel = url.searchParams.get('path');
  if (rel === null || !resolveInNotesDir(notesRoot, rel)) {
    return sendJson(res, 400, { error: 'invalid path' });
  }
  try {
    const note = await readNote(notesRoot, rel);
    sendJson(res, 200, { note });
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

/** PUT /one : body の note を作成 or 上書きする。 */
async function putNote({ req, res, notesRoot }: RouteContext): Promise<void> {
  const fields = await readJsonStringFields(req, ['path', 'body']);
  if (!fields) return sendJson(res, 400, { error: 'invalid body' });
  const abs = resolveInNotesDir(notesRoot, fields.path);
  if (!abs) return sendJson(res, 400, { error: 'invalid path' });
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, fields.body, 'utf8');
  const saved = await readNote(notesRoot, fields.path);
  sendJson(res, 200, { note: saved });
}

/** DELETE /one?path= : note を削除する。 */
async function deleteNote({ res, notesRoot, url }: RouteContext): Promise<void> {
  const abs = resolveInNotesDir(notesRoot, url.searchParams.get('path'));
  if (!abs) return sendJson(res, 400, { error: 'invalid path' });
  await fs.rm(abs, { force: true });
  sendJson(res, 200, { ok: true });
}

/** POST /rename : note を移動する。 */
async function renameNote({ req, res, notesRoot }: RouteContext): Promise<void> {
  const fields = await readJsonStringFields(req, ['oldPath', 'newPath']);
  if (!fields) return sendJson(res, 400, { error: 'invalid body' });
  const absOld = resolveInNotesDir(notesRoot, fields.oldPath);
  const absNew = resolveInNotesDir(notesRoot, fields.newPath);
  if (!absOld || !absNew) return sendJson(res, 400, { error: 'invalid path' });
  await fs.mkdir(path.dirname(absNew), { recursive: true });
  await fs.rename(absOld, absNew);
  sendJson(res, 200, { ok: true });
}

/**
 * method + pathname → ハンドラのルーティングテーブル。handle() はこの表を引くだけで、
 * 処理本体は各エンドポイント関数に委ねる。マッチしなければ末尾の 404 にフォールバックする。
 */
const routes: ReadonlyArray<{ method: string; pathname: string; handler: RouteHandler }> = [
  { method: 'GET', pathname: '/', handler: listNotes },
  { method: 'GET', pathname: '/one', handler: getNote },
  { method: 'PUT', pathname: '/one', handler: putNote },
  { method: 'DELETE', pathname: '/one', handler: deleteNote },
  { method: 'POST', pathname: '/rename', handler: renameNote },
];

async function handle(req: IncomingMessage, res: ServerResponse, notesRoot: string): Promise<void> {
  // 呼び出し側が `/api/notes` mount 部分を req.url から取り除いている前提
  // (connect の `use('/api/notes', ...)` / CLI のプレフィックス除去)。
  const url = new URL(req.url ?? '/', 'http://localhost');
  // URL パース後の pathname は通常 '/' 以上で '' にはならないが、元実装の
  // `pathname === ''` 分岐を防御的に踏襲し、空文字なら '/' と同一視する。
  const pathname = url.pathname === '' ? '/' : url.pathname;
  const method = req.method ?? 'GET';

  const route = routes.find((r) => r.method === method && r.pathname === pathname);
  if (!route) {
    sendJson(res, 404, { error: `unhandled ${method} ${pathname}` });
    return;
  }
  await route.handler({ req, res, notesRoot, url });
}

const SSE_KEEPALIVE_MS = 30_000;

/**
 * `createFsNotesHandler` の返り値。req/res を捌く関数本体に `close()` を生やしたもので、
 * 呼び出し側はこれまで通り `handler(req, res)` として呼べる。`close()` はサーバー停止時に
 * file watcher を確実に解放したい場合に呼ぶ (省略しても最後の SSE 接続切断で解放される)。
 */
export interface FsNotesHandler {
  (req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): void;
}

/**
 * notes ディレクトリを束縛した `/api/notes` ハンドラを生成する。
 *
 * - 通常の REST 系 (`/`, `/one`, `/rename`) は処理中の例外を捕捉し 500 (JSON) で応答する。
 * - `/events` は SSE。notes ディレクトリを file watch し、外部編集を接続中のブラウザへ push する (auto-reload)。
 *   watcher は SSE 初回接続で lazy に生成し、最後の接続が切れたら解放する (購読リークを防ぐ)。
 */
export function createFsNotesHandler(options: { notesRoot: string }): FsNotesHandler {
  const { notesRoot } = options;
  let watcher: NotesWatcher | null = null;
  // アクティブな SSE 接続の cleanup 関数。接続数の管理 (= watcher のライフサイクル) と
  // handler.close() による一括解放の両方に使う。
  const sessions = new Set<() => void>();

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    // 切断検知が遅れる環境向けに再接続間隔を提示し、初回ハンドシェイクを 1 行送る。
    res.write('retry: 3000\n\n');

    if (!watcher) watcher = createNotesWatcher(notesRoot);

    const send = (chunk: string): void => {
      if (res.writableEnded) return;
      try {
        res.write(chunk);
      } catch {
        // 接続が既に切れている場合は cleanup 側で解放されるため無視する。
      }
    };
    const unsubscribe = watcher.subscribe(() => send('event: change\ndata: {}\n\n'));
    // プロキシ / ブラウザに接続を生かし続けさせる keep-alive ping (コメント行)。
    const keepAlive = setInterval(() => send(': ping\n\n'), SSE_KEEPALIVE_MS);

    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(keepAlive);
      unsubscribe();
      sessions.delete(cleanup);
      // SSE レスポンスを閉じ、server.close() が待ち続けないようにする。
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
          // 既に切れている場合は無視する。
        }
      }
      // 最後の接続が消えたら watcher も解放する (購読リーク防止)。
      if (sessions.size === 0 && watcher) {
        watcher.close();
        watcher = null;
      }
    };
    sessions.add(cleanup);
    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  const handler = ((req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/events' && (req.method ?? 'GET') === 'GET') {
      handleEvents(req, res);
      return Promise.resolve();
    }
    return handle(req, res, notesRoot).catch((err) => {
      sendJson(res, 500, { error: String(err) });
    });
  }) as FsNotesHandler;

  handler.close = (): void => {
    // アクティブな全 SSE 接続を閉じる。各 cleanup が sessions から自身を消し、
    // 最後の 1 つが watcher を解放する (sessions のコピーを回して反復中の変更に耐える)。
    for (const cleanup of [...sessions]) cleanup();
    // 接続が 1 つも無かった場合に備え、watcher が残っていれば確実に解放する。
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };

  return handler;
}
