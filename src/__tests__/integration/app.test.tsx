import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

function sidebarText(text: string) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) throw new Error('sidebar not found');
  return within(sidebar as HTMLElement).getByText(text);
}

async function findSidebarText(text: string) {
  await waitFor(() => expect(sidebarText(text)).not.toBeNull());
}

describe('ノートを選択すると本文が表示される', () => {
  it('サイドバーのノートをクリックすると本文が表示される', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note B'));

    await screen.findByText('Content of note B.');
  });
});

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

describe('編集中に別ノートへ移動したとき変更が自動保存される', () => {
  it('編集中に別ノートをクリックすると draft が自動保存されて移動する', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nAutosaved content.');

    await userEvent.click(sidebarText('Note B'));

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

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nEditing but not saved.');

    await userEvent.click(sidebarText('Note A'));

    await new Promise((r) => setTimeout(r, 50));

    const saved = await db.notes.get('note-a.md');
    expect(saved?.body).toBe(NOTE_A.body);
  });

  it('変更がない場合はそのまま移動する（自動保存なし）', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await screen.findByText('Content of note A.');

    await userEvent.click(screen.getByTitle('編集 (E)'));
    expect(screen.getByRole('textbox')).toBeDefined();

    await userEvent.click(sidebarText('Note B'));

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

    await findSidebarText('Note A');
    fireEvent.contextMenu(sidebarText('Note A'));

    expect(screen.queryByText('削除')).not.toBeNull();
  });

  it('「削除」を選択して確認すると IndexedDB から削除されてサイドバーから消える', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note B');
    fireEvent.contextMenu(sidebarText('Note B'));
    await userEvent.click(screen.getByText('削除'));

    await waitFor(async () => {
      expect(await db.notes.get('note-b.md')).toBeUndefined();
    });
    await waitFor(() => {
      expect(document.querySelector('.sidebar')?.textContent).not.toContain('Note B');
    });
    vi.restoreAllMocks();
  });

  it('確認をキャンセルするとノートは削除されない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note B');
    fireEvent.contextMenu(sidebarText('Note B'));
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
    fireEvent.contextMenu(sidebarText('Note A'));
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
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('削除'));

    await waitFor(() => {
      expect(screen.queryByText('Content of note A.')).toBeNull();
    });
    await screen.findByText('ノートを選択');
    vi.restoreAllMocks();
  });
});

describe('既存ノートのパスを変更できる', () => {
  it('ファイル名だけを変更し、DB と現在選択中ノートを新しい path に更新する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    await db.settings.put({ key: 'lastOpenedPath', value: 'note-a.md' });
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'renamed-note.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await db.notes.get('note-a.md')).toBeUndefined();
      const renamed = await db.notes.get('renamed-note.md');
      expect(renamed?.body).toBe(NOTE_A.body);
      expect(renamed?.created).toBe(NOTE_A.created);
      expect(renamed?.updated).toBe(NOTE_A.updated);
    });
    await waitFor(() => {
      expect(document.querySelector('.crumb')?.textContent).toContain('renamed-note');
    });
    expect((await db.settings.get('lastOpenedPath'))?.value).toBe('renamed-note.md');
  });

  it('フォルダを含む path に移動するとサイドバーとパンくずが新しい path を表示する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/note-a.md');
    await userEvent.keyboard('{Enter}');

    await findSidebarText('archive');
    await waitFor(() => {
      expect(document.querySelector('.crumb')?.textContent).toContain('archive');
      expect(document.querySelector('.crumb')?.textContent).toContain('note-a');
    });
    expect(await db.notes.get('note-a.md')).toBeUndefined();
    expect(await db.notes.get('archive/note-a.md')).toBeDefined();
  });

  it('既存 path と衝突する場合は変更せずエラーを表示する', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'note-b.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「note-b.md」は既に存在します。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect((await db.notes.get('note-b.md'))?.body).toBe(NOTE_B.body);
  });

  it('ファイル名を含まない path には変更しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('ファイル名を含むパスを入力してください。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect(await db.notes.get('archive/.md')).toBeUndefined();
  });

  it('先頭スラッシュと重複スラッシュは正規化して変更する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, '/archive//note-a.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await db.notes.get('note-a.md')).toBeUndefined();
      expect(await db.notes.get('archive/note-a.md')).toBeDefined();
    });
  });

  it('親ディレクトリ参照を含む path には変更しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, '../note-a.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「.」または「..」を含むパスは使えません。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect(await db.notes.get('../note-a.md')).toBeUndefined();
  });

  it('カレントディレクトリ参照を含む path には変更しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/./note-a.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「.」または「..」を含むパスは使えません。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect(await db.notes.get('archive/./note-a.md')).toBeUndefined();
  });

  it('編集中の現在ノートを変更すると draft は画面上に保持され、保存時に新 path へ保存される', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nDraft before rename.');

    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'draft-renamed.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await db.notes.get('note-a.md')).toBeUndefined();
      expect((await db.notes.get('draft-renamed.md'))?.body).toBe(NOTE_A.body);
    });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '# Note A\n\nDraft before rename.'
    );
    await userEvent.click(screen.getByText(/保存/));
    await screen.findByText('Draft before rename.');
    expect((await db.notes.get('draft-renamed.md'))?.body).toBe('# Note A\n\nDraft before rename.');
  });

  it('編集中に path を変更してから ESC すると draft は破棄される', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nDiscard after rename.');

    fireEvent.contextMenu(sidebarText('Note A'));
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'discard-renamed.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(document.querySelector('.crumb')?.textContent).toContain('discard-renamed');
    });
    await userEvent.keyboard('{Escape}');

    await screen.findByText('Content of note A.');
    expect(screen.queryByText('Discard after rename.')).toBeNull();
    expect((await db.notes.get('discard-renamed.md'))?.body).toBe(NOTE_A.body);
  });
});
