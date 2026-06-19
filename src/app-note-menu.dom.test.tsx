import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import App from './app';
import { db } from './db';
import {
  NOTE_A,
  NOTE_B,
  resetStateBeforeEach,
  sidebarText,
  findSidebarText,
  openNoteActions,
} from './test-support/app-test-helpers';

resetStateBeforeEach();

describe('ノート行のメニューからノートを操作できる', () => {
  it('ファイル行の操作ボタンからメニューが表示される', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note A');
    await openNoteActions('Note A');

    expect(screen.queryByText('削除')).not.toBeNull();
  });

  it('ファイル行の右クリックではアプリ独自メニューを表示しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    fireEvent.contextMenu(sidebarText('Note A'));

    expect(screen.queryByText('削除')).toBeNull();
    expect(screen.queryByText('パス変更')).toBeNull();
  });

  it('操作ボタンはキーボードで開閉でき、メニュー項目へフォーカスが移る', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    const row = sidebarText('Note A').closest('.sb-file');
    if (!row) throw new Error('note row not found: Note A');
    const actionButton = within(row as HTMLElement).getByRole('button', { name: 'Note A の操作' });

    actionButton.focus();
    await userEvent.keyboard('{Enter}');

    expect(actionButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'パス変更' }));

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '削除' }));
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'パス変更' }));
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '削除' }));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'パス変更' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(actionButton);
  });

  it('開いている操作ボタンをもう一度押すとメニューを閉じる', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    await openNoteActions('Note A');
    expect(screen.getByRole('menu')).not.toBeNull();

    await openNoteActions('Note A');

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('「削除」を選択して確認すると IndexedDB から削除されてサイドバーから消える', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note B');
    await openNoteActions('Note B');
    await userEvent.click(screen.getByText('削除'));

    await waitFor(async () => {
      expect(await db.notes.get('note-b.md')).toBeUndefined();
    });
    await waitFor(() => {
      expect(document.querySelector('.sidebar')?.textContent).not.toContain('Note B');
    });
    vi.restoreAllMocks();
  });

  it('ノート削除時に紐づく画像アセットも削除する', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    await db.imageAssets.bulkPut([
      {
        id: 'asset-a',
        notePath: 'note-a.md',
        filename: 'a.png',
        mimeType: 'image/png',
        blob: new Blob(['a'], { type: 'image/png' }),
        created: '2024-01-01',
      },
      {
        id: 'asset-b',
        notePath: 'note-b.md',
        filename: 'b.png',
        mimeType: 'image/png',
        blob: new Blob(['b'], { type: 'image/png' }),
        created: '2024-01-01',
      },
    ]);
    render(<App />);

    await findSidebarText('Note A');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('削除'));

    await waitFor(async () => {
      expect(await db.imageAssets.get('asset-a')).toBeUndefined();
      expect(await db.imageAssets.get('asset-b')).toBeDefined();
    });
    vi.restoreAllMocks();
  });

  it('確認をキャンセルするとノートは削除されない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note B');
    await openNoteActions('Note B');
    await userEvent.click(screen.getByText('削除'));

    await new Promise((r) => setTimeout(r, 50));
    const saved = await db.notes.get('note-b.md');
    expect(saved).toBeDefined();
    vi.restoreAllMocks();
  });

  it('表示中のノートを削除すると別のノートへ移動する', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('削除'));

    await waitFor(() => {
      expect(screen.queryByText('Content of note A.')).toBeNull();
    });
    await screen.findByText('Content of note B.');
    vi.restoreAllMocks();
  });

  it('最後の1件を削除すると空表示になる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('削除'));

    await waitFor(() => {
      expect(screen.queryByText('Content of note A.')).toBeNull();
    });
    await screen.findByText('ノートを選択');
    vi.restoreAllMocks();
  });
});
