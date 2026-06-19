import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import App from './app';
import { db } from './db';
import {
  NOTE_A,
  NOTE_B,
  resetStateBeforeEach,
  sidebarText,
  findSidebarText,
} from './test-support/app-test-helpers';

resetStateBeforeEach();

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

  it('自動保存でも未参照になった画像アセットを削除する', async () => {
    await db.notes.bulkPut([
      { ...NOTE_A, body: '# Note A\n\n![screen shot](aze-asset:asset-a)' },
      NOTE_B,
    ]);
    await db.imageAssets.put({
      id: 'asset-a',
      notePath: 'note-a.md',
      filename: 'screen-shot.png',
      mimeType: 'image/png',
      blob: new Blob(['image'], { type: 'image/png' }),
      created: '2024-01-01',
    });
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note A'));
    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nAutosaved content.');

    await userEvent.click(sidebarText('Note B'));

    await waitFor(async () => {
      expect(await db.imageAssets.get('asset-a')).toBeUndefined();
    });
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
