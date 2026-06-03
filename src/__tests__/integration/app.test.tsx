import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../app';
import { db } from '../../db';
import type { Note } from '../../data';

const NOTE_A: Note = {
  path: 'note-a.md',
  body: '# Note A\n\nContent of note A.',
  created: '2024-01-01',
  updated: '2024-01-01',
};

const NOTE_B: Note = {
  path: 'note-b.md',
  body: '# Note B\n\nContent of note B.',
  created: '2024-01-01',
  updated: '2024-01-01',
};

beforeEach(async () => {
  await db.notes.clear();
  await db.settings.clear();
});

describe('ノートを選択すると本文が表示される', () => {
  it('サイドバーのノートをクリックすると本文が表示される', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-a');
    await userEvent.click(screen.getByText('note-b'));

    await screen.findByText('Content of note B.');
  });
});

describe('編集モード → 保存 → 閲覧モードに戻る', () => {
  it('保存ボタンで変更が保存されて閲覧モードに戻る', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('note-a');
    await userEvent.click(screen.getAllByText('note-a')[0]);
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nUpdated content.');

    await userEvent.click(screen.getByText(/保存/));

    await screen.findByText('Updated content.');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('編集モード → ESC → 変更が破棄される', () => {
  it('ESC キーでドラフトが破棄されて閲覧モードに戻る', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('note-a');
    await userEvent.click(screen.getAllByText('note-a')[0]);
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

    await screen.findByText('note-a');
    await userEvent.click(screen.getAllByText('note-a')[0]);
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

describe('編集中に別ノートへ移動したとき変更が自動保存される', () => {
  it('編集中に別ノートをクリックすると draft が自動保存されて移動する', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-a');
    await userEvent.click(screen.getAllByText('note-a')[0]);
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nAutosaved content.');

    await userEvent.click(screen.getByText('note-b'));

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    await screen.findByText('Content of note B.');

    const saved = await db.notes.get('note-a.md');
    expect(saved?.body).toBe('# Note A\n\nAutosaved content.');
  });

  it('同じノートを再クリックしても自動保存されない', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-a');
    await userEvent.click(screen.getAllByText('note-a')[0]);
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nEditing but not saved.');

    const noteAItems = screen.getAllByText('note-a');
    await userEvent.click(noteAItems[0]);

    await new Promise((r) => setTimeout(r, 50));

    const saved = await db.notes.get('note-a.md');
    expect(saved?.body).toBe(NOTE_A.body);
  });

  it('変更がない場合はそのまま移動する（自動保存なし）', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-a');
    await userEvent.click(screen.getAllByText('note-a')[0]);
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    expect(screen.getByRole('textbox')).toBeDefined();

    await userEvent.click(screen.getByText('note-b'));

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    await screen.findByText('Content of note B.');

    const saved = await db.notes.get('note-a.md');
    expect(saved?.body).toBe(NOTE_A.body);
  });
});

describe('コンテキストメニューからノートを削除できる', () => {
  it('ファイル行を右クリックするとコンテキストメニューが表示される', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-a');
    fireEvent.contextMenu(screen.getAllByText('note-a')[0]);

    expect(screen.queryByText('削除')).not.toBeNull();
  });

  it('「削除」を選択して確認すると IndexedDB から削除されてサイドバーから消える', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-b');
    fireEvent.contextMenu(screen.getByText('note-b'));
    await userEvent.click(screen.getByText('削除'));

    await waitFor(async () => {
      expect(await db.notes.get('note-b.md')).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.queryByText('note-b')).toBeNull();
    });
    vi.restoreAllMocks();
  });

  it('確認をキャンセルするとノートは削除されない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('note-b');
    fireEvent.contextMenu(screen.getByText('note-b'));
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
    fireEvent.contextMenu(screen.getAllByText('note-a')[0]);
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
    fireEvent.contextMenu(screen.getAllByText('note-a')[0]);
    await userEvent.click(screen.getByText('削除'));

    await waitFor(() => {
      expect(screen.queryByText('Content of note A.')).toBeNull();
    });
    await screen.findByText('ノートを選択');
    vi.restoreAllMocks();
  });
});
