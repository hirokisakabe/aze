import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { RenameNoteDialog } from './rename-note-dialog';

describe('RenameNoteDialog', () => {
  it('initialPath を初期値として入力欄に表示する', () => {
    render(<RenameNoteDialog initialPath="note.md" onRename={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('archive/note.md') as HTMLInputElement;
    expect(input.value).toBe('note.md');
  });

  it('Enter で正規化済みパスを onRename に渡し、成功時に onCancel を呼ぶ', async () => {
    const onRename = vi.fn<(path: string) => Promise<string | null>>().mockResolvedValue(null);
    const onCancel = vi.fn();
    render(<RenameNoteDialog initialPath="note.md" onRename={onRename} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/renamed');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('archive/renamed.md'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  it('onRename がメッセージを返した場合はエラー表示し onCancel を呼ばない', async () => {
    const onRename = vi
      .fn<(path: string) => Promise<string | null>>()
      .mockResolvedValue('「dup.md」は既に存在します。');
    const onCancel = vi.fn();
    render(<RenameNoteDialog initialPath="note.md" onRename={onRename} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'dup.md');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('「dup.md」は既に存在します。')
    );
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('不正なパスは onRename を呼ばずエラーを表示する', async () => {
    const onRename = vi.fn<(path: string) => Promise<string | null>>();
    render(<RenameNoteDialog initialPath="note.md" onRename={onRename} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'folder/');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'ファイル名を含むパスを入力してください。'
      )
    );
    expect(onRename).not.toHaveBeenCalled();
  });
});
