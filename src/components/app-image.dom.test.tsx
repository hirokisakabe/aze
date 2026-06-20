import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import { db } from '../repository/db';
import {
  NOTE_A,
  resetStateBeforeEach,
  sidebarText,
  findSidebarText,
} from '../test-support/app-test-helpers';

import App from './app';

resetStateBeforeEach();

describe('編集モードで画像をアップロードできる', () => {
  async function openEditor(body = '# Note A\n\nHello') {
    await db.notes.put({ ...NOTE_A, body });
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await userEvent.click(screen.getByTitle('編集 (E)'));

    return screen.getByRole('textbox') as HTMLTextAreaElement;
  }

  it('選択した画像を保存し、カーソル位置へ Markdown 画像記法を挿入してプレビュー表示する', async () => {
    const textarea = await openEditor();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const input = document.querySelector('.image-input') as HTMLInputElement;
    const file = new File(['image-bytes'], 'screen-shot.png', { type: 'image/png' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(textarea.value).toMatch(/!\[screen shot\]\(aze-asset:[^)]+\)/);
    });

    const assets = await db.imageAssets.toArray();
    expect(assets).toHaveLength(1);
    expect(assets[0].filename).toBe('screen-shot.png');
    expect(assets[0].mimeType).toBe('image/png');

    await userEvent.click(screen.getByText(/保存/));

    const img = await screen.findByRole('img', { name: 'screen shot' });
    expect(img.className).toContain('md-img');
    await waitFor(() => {
      expect(img.getAttribute('src')).toBe('blob:mock-url');
    });
    expect(img.getAttribute('data-asset-id')).toBe(assets[0].id);
  });

  it('非画像ファイルは本文を変更せずエラーを表示する', async () => {
    const textarea = await openEditor();
    const before = textarea.value;

    const input = document.querySelector('.image-input') as HTMLInputElement;
    const file = new File(['plain'], 'memo.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect((await screen.findByRole('alert')).textContent).toContain(
      '画像ファイルのみ追加できます。'
    );
    expect(textarea.value).toBe(before);
    expect(await db.imageAssets.count()).toBe(0);
  });

  it('画像追加後に編集を取り消すと未保存の画像アセットを削除する', async () => {
    await openEditor();

    const input = document.querySelector('.image-input') as HTMLInputElement;
    const file = new File(['image-bytes'], 'screen-shot.png', { type: 'image/png' });
    await userEvent.upload(input, file);

    await waitFor(async () => {
      expect(await db.imageAssets.count()).toBe(1);
    });
    await userEvent.keyboard('{Escape}');

    await waitFor(async () => {
      expect(await db.imageAssets.count()).toBe(0);
    });
  });

  it('画像 Markdown を削除して保存すると未参照の画像アセットを削除する', async () => {
    const textarea = await openEditor(
      '# Note A\n\n![screen shot](aze-asset:asset-a)\n\nContent of note A.'
    );
    await db.imageAssets.put({
      id: 'asset-a',
      notePath: 'note-a.md',
      filename: 'screen-shot.png',
      mimeType: 'image/png',
      blob: new Blob(['image'], { type: 'image/png' }),
      created: '2024-01-01',
    });

    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nContent of note A.');
    await userEvent.click(screen.getByText(/保存/));

    await waitFor(async () => {
      expect(await db.imageAssets.get('asset-a')).toBeUndefined();
    });
  });
});
