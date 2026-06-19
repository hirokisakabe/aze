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

import type { Note } from './data';

resetStateBeforeEach();

describe('新規ノートダイアログからノートを作成できる', () => {
  it('+ ボタンでダイアログが開き、パスを入力してノートを作成できる', async () => {
    render(<App />);

    await userEvent.click(screen.getByLabelText('新規ノート'));

    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'test-note.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('ideas/new-idea.md')).toBeNull();
    });

    const saved = await db.notes.get('test-note.md');
    expect(saved).toBeDefined();
    expect(saved?.path).toBe('test-note.md');

    await screen.findByRole('textbox');
  });

  it('IME変換中のEnterキーではノートが作成されない', async () => {
    render(<App />);

    await userEvent.click(screen.getByLabelText('新規ノート'));

    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'ime-note.md');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByPlaceholderText('ideas/new-idea.md')).not.toBeNull();

    const saved = await db.notes.get('ime-note.md');
    expect(saved).toBeUndefined();
  });
});

describe('新規ノートダイアログのデフォルトパスは現在のノートのフォルダに合わせる', () => {
  const folderNote: Note = {
    path: 'daily/2024-06-02.md',
    body: '# Daily Note',
    created: '2024-06-02',
    updated: '2024-06-02',
  };

  it('ルート直下のノートを開いているときはデフォルトが空になる', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md') as HTMLInputElement;

    expect(input.value).toBe('');
  });

  it('フォルダ配下のノートを開いているときは入力欄のデフォルトがそのフォルダになる', async () => {
    await db.notes.bulkPut([folderNote]);
    render(<App />);

    await findSidebarText('Daily Note');
    await userEvent.click(sidebarText('Daily Note'));
    await screen.findByTitle('編集 (E)');

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md') as HTMLInputElement;

    expect(input.value).toBe('daily/');
  });

  it('デフォルトパスにファイル名を追加するとそのフォルダ配下に作成される', async () => {
    await db.notes.bulkPut([folderNote]);
    render(<App />);

    await findSidebarText('Daily Note');
    await userEvent.click(sidebarText('Daily Note'));
    await screen.findByTitle('編集 (E)');

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'new-entry.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('ideas/new-idea.md')).toBeNull();
    });

    const saved = await db.notes.get('daily/new-entry.md');
    expect(saved).toBeDefined();
    expect(saved?.path).toBe('daily/new-entry.md');
  });

  it('入力欄を編集して別フォルダのパスを指定した場合はその値が優先される', async () => {
    await db.notes.bulkPut([folderNote]);
    render(<App />);

    await findSidebarText('Daily Note');
    await userEvent.click(sidebarText('Daily Note'));
    await screen.findByTitle('編集 (E)');

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'other/custom-note.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('ideas/new-idea.md')).toBeNull();
    });

    const saved = await db.notes.get('other/custom-note.md');
    expect(saved).toBeDefined();
    expect(saved?.path).toBe('other/custom-note.md');
  });

  it('ファイル名を含まないパスは作成されない', async () => {
    render(<App />);

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'archive/');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('ファイル名を含むパスを入力してください。')).not.toBeNull();
    expect(await db.notes.get('archive/.md')).toBeUndefined();
  });

  it('親ディレクトリ参照を含むパスは作成されない', async () => {
    render(<App />);

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'archive/../note.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「.」または「..」を含むパスは使えません。')).not.toBeNull();
    expect(await db.notes.get('archive/../note.md')).toBeUndefined();
  });

  it('カレントディレクトリ参照を含むパスは作成されない', async () => {
    render(<App />);

    await userEvent.click(screen.getByLabelText('新規ノート'));
    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'archive/./note.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「.」または「..」を含むパスは使えません。')).not.toBeNull();
    expect(await db.notes.get('archive/./note.md')).toBeUndefined();
  });
});
