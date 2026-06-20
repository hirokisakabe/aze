import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import { db } from '../repository/db';
import {
  NOTE_A,
  NOTE_B,
  resetStateBeforeEach,
  sidebarText,
  findSidebarText,
} from '../test-support/app-test-helpers';

import App from './app';

resetStateBeforeEach();

async function openEditor(body: string, title = 'note-a') {
  await db.notes.put({ ...NOTE_A, body });
  render(<App />);

  await findSidebarText(title);
  await userEvent.click(sidebarText(title));
  await userEvent.click(screen.getByTitle('編集 (E)'));

  return screen.getByRole('textbox') as HTMLTextAreaElement;
}

function undo(textarea: HTMLTextAreaElement) {
  fireEvent.keyDown(textarea, { key: 'z', metaKey: true });
}

function redo(textarea: HTMLTextAreaElement) {
  fireEvent.keyDown(textarea, { key: 'z', metaKey: true, shiftKey: true });
}

describe('editor の通常入力を undo/redo できる', () => {
  it('Cmd+Z で直前の入力を undo し、Cmd+Shift+Z で redo できる', async () => {
    const textarea = await openEditor('hello');

    fireEvent.change(textarea, { target: { value: 'hello world' } });
    await waitFor(() => expect(textarea.value).toBe('hello world'));

    undo(textarea);
    await waitFor(() => expect(textarea.value).toBe('hello'));

    redo(textarea);
    await waitFor(() => expect(textarea.value).toBe('hello world'));
  });

  it('Ctrl+Y でも redo できる', async () => {
    const textarea = await openEditor('hello');

    fireEvent.change(textarea, { target: { value: 'hello!' } });
    await waitFor(() => expect(textarea.value).toBe('hello!'));

    undo(textarea);
    await waitFor(() => expect(textarea.value).toBe('hello'));

    fireEvent.keyDown(textarea, { key: 'y', ctrlKey: true });
    await waitFor(() => expect(textarea.value).toBe('hello!'));
  });
});

describe('editor の Tab インデント操作を undo/redo できる', () => {
  it('単一行インデントを undo/redo でき、カーソル位置も復元される', async () => {
    const textarea = await openEditor('first\nsecond');
    textarea.setSelectionRange(7, 7);

    fireEvent.keyDown(textarea, { key: 'Tab' });
    await waitFor(() => expect(textarea.value).toBe('first\n  second'));
    expect(textarea.selectionStart).toBe(9);

    undo(textarea);
    await waitFor(() => expect(textarea.value).toBe('first\nsecond'));
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);

    redo(textarea);
    await waitFor(() => expect(textarea.value).toBe('first\n  second'));
    expect(textarea.selectionStart).toBe(9);
    expect(textarea.selectionEnd).toBe(9);
  });

  it('Shift+Tab の単一行アンインデントを undo/redo できる', async () => {
    const textarea = await openEditor('first\n  second');
    textarea.setSelectionRange(9, 9);

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(textarea.value).toBe('first\nsecond'));
    expect(textarea.selectionStart).toBe(7);

    undo(textarea);
    await waitFor(() => expect(textarea.value).toBe('first\n  second'));
    expect(textarea.selectionStart).toBe(9);
    expect(textarea.selectionEnd).toBe(9);

    redo(textarea);
    await waitFor(() => expect(textarea.value).toBe('first\nsecond'));
    expect(textarea.selectionStart).toBe(7);
  });

  it('複数行選択の Tab を undo/redo でき、選択範囲も復元される', async () => {
    const textarea = await openEditor('alpha\nbeta\ngamma');
    textarea.setSelectionRange(1, 10);

    fireEvent.keyDown(textarea, { key: 'Tab' });
    await waitFor(() => expect(textarea.value).toBe('  alpha\n  beta\ngamma'));
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(14);

    undo(textarea);
    await waitFor(() => expect(textarea.value).toBe('alpha\nbeta\ngamma'));
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(10);

    redo(textarea);
    await waitFor(() => expect(textarea.value).toBe('  alpha\n  beta\ngamma'));
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(14);
  });
});

describe('editor の画像 Markdown 挿入を undo できる', () => {
  it('ファイル選択で挿入された画像 Markdown を Cmd+Z で undo できる', async () => {
    const textarea = await openEditor('# Note A\n\nHello', 'Note A');
    const before = textarea.value;
    textarea.setSelectionRange(before.length, before.length);

    const input = document.querySelector('.image-input') as HTMLInputElement;
    const file = new File(['image-bytes'], 'screen-shot.png', { type: 'image/png' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(textarea.value).toMatch(/!\[screen shot\]\(aze-asset:[^)]+\)/);
    });

    undo(textarea);
    await waitFor(() => expect(textarea.value).toBe(before));
  });
});

describe('別ノートに切り替えると undo 履歴が混ざらない', () => {
  it('編集中のノートを切り替えると、以前のノートの履歴で undo できない', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await userEvent.click(screen.getByTitle('編集 (E)'));

    const textareaA = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textareaA, { target: { value: 'A edited' } });
    await waitFor(() => expect(textareaA.value).toBe('A edited'));

    // 別ノート B に移動 (編集中の A は autosave される) → B を編集
    await userEvent.click(sidebarText('Note B'));
    await userEvent.click(screen.getByTitle('編集 (E)'));

    const textareaB = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textareaB.value).toBe(NOTE_B.body);

    // A の履歴は引き継がれないので、何もしていない B では undo しても変化しない
    undo(textareaB);
    await waitFor(() => expect(textareaB.value).toBe(NOTE_B.body));
  });
});
