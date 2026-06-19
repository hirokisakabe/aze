import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * dev-only な filesystem notes backend (issue #78 最小実験版)。
 *
 * Vite の dev サーバーにのみ `/api/notes` middleware を生やし、`AZE_VAULT_PATH` が指す
 * vault の .md を Node `fs` で読み書きする。`vite build` / `preview` / 本番では一切動かない。
 *
 * API:
 * - `GET    /api/notes`              → { notes: Note[] }  (vault 配下の .md を再帰列挙)
 * - `GET    /api/notes/one?path=...` → { note: Note } | 404
 * - `PUT    /api/notes/one`          → { note: Note }     (body: Note。作成 or 上書き)
 * - `DELETE /api/notes/one?path=...` → { ok: true }
 * - `POST   /api/notes/rename`       → { ok: true }       (body: { oldPath, newPath })
 *
 * 制約 (最小実験):
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

function expandHome(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function toDateString(d: Date): string {
  return dateFormat.format(d);
}

/** rel が vault root 配下の .md を指すことを保証する。逸脱したら null。 */
function resolveInVault(vaultRoot: string, rel: string | null | undefined): string | null {
  if (!rel || !rel.endsWith('.md')) return null;
  const abs = path.resolve(vaultRoot, rel);
  if (abs !== vaultRoot && !abs.startsWith(vaultRoot + path.sep)) return null;
  return abs;
}

async function listMarkdown(vaultRoot: string, dir = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(vaultRoot, dir), { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listMarkdown(vaultRoot, rel)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

async function readNote(vaultRoot: string, rel: string): Promise<FsNote> {
  const abs = path.join(vaultRoot, rel);
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

async function handle(req: IncomingMessage, res: ServerResponse, vaultRoot: string): Promise<void> {
  // connect は `use('/api/notes', ...)` のマッチ部分を req.url から取り除く。
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;
  const method = req.method ?? 'GET';

  if (method === 'GET' && (pathname === '/' || pathname === '')) {
    const rels = await listMarkdown(vaultRoot);
    const notes = await Promise.all(rels.map((rel) => readNote(vaultRoot, rel)));
    sendJson(res, 200, { notes });
    return;
  }

  if (pathname === '/one') {
    if (method === 'GET') {
      const abs = resolveInVault(vaultRoot, url.searchParams.get('path'));
      const rel = url.searchParams.get('path');
      if (!abs || !rel) return sendJson(res, 400, { error: 'invalid path' });
      try {
        const note = await readNote(vaultRoot, rel);
        return sendJson(res, 200, { note });
      } catch {
        return sendJson(res, 404, { error: 'not found' });
      }
    }
    if (method === 'PUT') {
      const note = JSON.parse(await readBody(req)) as FsNote;
      const abs = resolveInVault(vaultRoot, note.path);
      if (!abs) return sendJson(res, 400, { error: 'invalid path' });
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, note.body, 'utf8');
      const saved = await readNote(vaultRoot, note.path);
      return sendJson(res, 200, { note: saved });
    }
    if (method === 'DELETE') {
      const abs = resolveInVault(vaultRoot, url.searchParams.get('path'));
      if (!abs) return sendJson(res, 400, { error: 'invalid path' });
      await fs.rm(abs, { force: true });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/rename' && method === 'POST') {
    const { oldPath, newPath } = JSON.parse(await readBody(req)) as {
      oldPath: string;
      newPath: string;
    };
    const absOld = resolveInVault(vaultRoot, oldPath);
    const absNew = resolveInVault(vaultRoot, newPath);
    if (!absOld || !absNew) return sendJson(res, 400, { error: 'invalid path' });
    await fs.mkdir(path.dirname(absNew), { recursive: true });
    await fs.rename(absOld, absNew);
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: `unhandled ${method} ${pathname}` });
}

export function fsNotesPlugin(options: { vaultPath?: string }): Plugin {
  const vaultRoot = options.vaultPath ? path.resolve(expandHome(options.vaultPath)) : '';
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
        if (!vaultRoot) {
          sendJson(res, 500, { error: 'AZE_VAULT_PATH is not set' });
          return;
        }
        handle(req, res, vaultRoot).catch((err) => {
          sendJson(res, 500, { error: String(err) });
        });
      });
    },
  };
}
