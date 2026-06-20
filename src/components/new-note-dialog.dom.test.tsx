import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { NewNoteDialog } from './new-note-dialog';

describe('NewNoteDialog', () => {
  it('defaultPrefix を初期値として入力欄に表示する', () => {
    render(<NewNoteDialog defaultPrefix="ideas/" onCreate={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('ideas/new-idea.md') as HTMLInputElement;
    expect(input.value).toBe('ideas/');
  });

  it('Enter で正規化済みパスを onCreate に渡す', async () => {
    const onCreate = vi.fn();
    render(<NewNoteDialog defaultPrefix="" onCreate={onCreate} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('ideas/new-idea.md');
    await userEvent.type(input, 'ideas/new');
    await userEvent.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('ideas/new.md');
  });

  it('不正なパスはエラーを表示し onCreate を呼ばない', async () => {
    const onCreate = vi.fn();
    render(<NewNoteDialog defaultPrefix="folder/" onCreate={onCreate} onCancel={vi.fn()} />);
    await userEvent.keyboard('{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      'ファイル名を含むパスを入力してください。'
    );
  });

  it('Escape で onCancel を呼ぶ', async () => {
    const onCancel = vi.fn();
    render(<NewNoteDialog defaultPrefix="" onCreate={vi.fn()} onCancel={onCancel} />);
    await userEvent.type(screen.getByPlaceholderText('ideas/new-idea.md'), '{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});
