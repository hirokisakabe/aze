import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsNotesHandler } from './fs-notes-handler';

const WAIT_TIMEOUT = 3000;

/** SSE 用の最小限 req/res モック。req は close を emit でき、res は write を蓄積する。 */
function makeConnection() {
  const req = new EventEmitter() as unknown as IncomingMessage & EventEmitter;
  req.method = 'GET';
  req.url = '/events';

  const chunks: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    statusCode: 0,
    writableEnded: false,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
    },
    flushHeaders() {},
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  }) as unknown as ServerResponse & { statusCode: number; headers: Record<string, string> };

  return { req, res, chunks };
}

describe('createFsNotesHandler /events (SSE)', () => {
  let notesDir: string;

  beforeEach(() => {
    notesDir = mkdtempSync(path.join(os.tmpdir(), 'aze-sse-'));
    writeFileSync(path.join(notesDir, 'hello.md'), '# Hello\n');
  });

  afterEach(() => {
    rmSync(notesDir, { recursive: true, force: true });
  });

  it('SSE ヘッダと初回 retry 行を返す', async () => {
    const handler = createFsNotesHandler({ notesRoot: notesDir });
    const { req, res, chunks } = makeConnection();
    await handler(req, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(
      (res as unknown as { headers: Record<string, string> }).headers['content-type']
    ).toContain('text/event-stream');
    expect(chunks.join('')).toContain('retry:');

    req.emit('close');
    handler.close();
  });

  it('notes ディレクトリの .md 変更で change イベントを push する', async () => {
    const handler = createFsNotesHandler({ notesRoot: notesDir });
    const { req, res, chunks } = makeConnection();
    await handler(req, res as unknown as ServerResponse);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(retry);
        reject(new Error('change event was not pushed within timeout'));
      }, WAIT_TIMEOUT);
      // ハンドラ既定の debounce (150ms) を確実に settle させるため、再試行間隔は十分広く取る。
      // 短すぎると連続書き込みが trailing debounce をリセットし続けて発火しない。
      const retry = setInterval(() => {
        if (chunks.some((c) => c.includes('event: change'))) {
          clearTimeout(timer);
          clearInterval(retry);
          resolve(undefined);
          return;
        }
        writeFileSync(path.join(notesDir, 'hello.md'), `# Edited ${Date.now()}\n`);
      }, 500);
    });

    req.emit('close');
    handler.close();
  });

  it('close() は接続が無くても安全に呼べる', () => {
    const handler = createFsNotesHandler({ notesRoot: notesDir });
    expect(() => handler.close()).not.toThrow();
  });

  it('close() はアクティブな SSE 接続を閉じる (response を end する)', async () => {
    const handler = createFsNotesHandler({ notesRoot: notesDir });
    const { req, res } = makeConnection();
    await handler(req, res as unknown as ServerResponse);

    expect((res as unknown as { writableEnded: boolean }).writableEnded).toBe(false);
    handler.close();
    expect((res as unknown as { writableEnded: boolean }).writableEnded).toBe(true);

    req.emit('close'); // 二重 cleanup が安全なことも確認 (throw しない)。
  });
});
