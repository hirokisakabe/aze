import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import App from './app';
import { db } from './db';
import {
  NOTE_A,
  resetStateBeforeEach,
  sidebarText,
  findSidebarText,
} from './test-support/app-test-helpers';

resetStateBeforeEach();

describe('編集モード → 保存 → 閲覧モードに戻る', () => {
  it('保存ボタンで変更が保存されて閲覧モードに戻る', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nUpdated content.');

    await userEvent.click(screen.getByText(/保存/));

    await screen.findByText('Updated content.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(sidebarText('Note A')).not.toBeNull();
  });

  it('先頭見出しを変更して保存するとサイドバーの表示タイトルも更新される', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Renamed Title\n\nContent of note A.');

    await userEvent.click(screen.getByText(/保存/));

    await findSidebarText('Renamed Title');
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Note A');
    expect(screen.getByText('note-a')).not.toBeNull();
  });

  it('先頭見出しがないノートはファイル名由来のタイトルをサイドバーに表示する', async () => {
    await db.notes.put({ ...NOTE_A, body: 'Plain text only' });
    render(<App />);

    await findSidebarText('note-a');
    await screen.findByText('Plain text only');
  });
});

describe('編集モード → ESC → 変更が破棄される', () => {
  it('ESC キーでドラフトが破棄されて閲覧モードに戻る', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Discarded changes');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(screen.queryByText('Discarded changes')).toBeNull();
  });
});

describe('編集 textarea で Tab インデントを操作できる', () => {
  async function openEditor(body: string) {
    await db.notes.put({ ...NOTE_A, body });
    render(<App />);

    await findSidebarText('note-a');
    await userEvent.click(sidebarText('note-a'));
    await userEvent.click(screen.getByTitle('編集 (E)'));

    return screen.getByRole('textbox') as HTMLTextAreaElement;
  }

  it('Tab キーでフォーカスを維持したままカーソル位置の行にスペース2つを挿入する', async () => {
    const textarea = await openEditor('first\nsecond');
    textarea.setSelectionRange(7, 7);

    fireEvent.keyDown(textarea, { key: 'Tab' });

    await waitFor(() => {
      expect(textarea.value).toBe('first\n  second');
    });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(9);
    expect(textarea.selectionEnd).toBe(9);
  });

  it('Shift+Tab キーでカーソル位置の行頭インデントを削除する', async () => {
    const textarea = await openEditor('first\n  second');
    textarea.setSelectionRange(9, 9);

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe('first\nsecond');
    });
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('インデントのない行で Shift+Tab を押しても次の入力でカーソル位置が巻き戻らない', async () => {
    const textarea = await openEditor('plain');
    textarea.setSelectionRange(2, 2);

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });

    expect(textarea.value).toBe('plain');
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);

    textarea.setSelectionRange(5, 5);
    fireEvent.change(textarea, { target: { value: 'plain!' } });

    await waitFor(() => {
      expect(textarea.value).toBe('plain!');
    });
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(6);
  });

  it('複数行選択中に Tab/Shift+Tab キーで選択行すべてに適用する', async () => {
    const textarea = await openEditor('alpha\nbeta\ngamma');
    textarea.setSelectionRange(1, 10);

    fireEvent.keyDown(textarea, { key: 'Tab' });

    await waitFor(() => {
      expect(textarea.value).toBe('  alpha\n  beta\ngamma');
    });
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(14);

    textarea.setSelectionRange(3, 14);
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe('alpha\nbeta\ngamma');
    });
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(10);
  });
});
