import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect } from 'vitest';

import { db } from '../db';

import type { Note } from '../data';

export const NOTE_A: Note = {
  path: 'note-a.md',
  body: '# Note A\n\nContent of note A.',
  created: '2024-01-01',
  updated: '2024-01-01',
};

export const NOTE_B: Note = {
  path: 'note-b.md',
  body: '# Note B\n\nContent of note B.',
  created: '2024-01-01',
  updated: '2024-01-01',
};

/** 各テストの前に localStorage と IndexedDB のテーブルを初期化する beforeEach を登録する。 */
export function resetStateBeforeEach() {
  beforeEach(async () => {
    localStorage.clear();
    await db.notes.clear();
    await db.settings.clear();
    await db.imageAssets.clear();
  });
}

export function sidebarText(text: string) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) throw new Error('sidebar not found');
  return within(sidebar as HTMLElement).getByText(text);
}

export async function findSidebarText(text: string) {
  await waitFor(() => expect(sidebarText(text)).not.toBeNull());
}

export async function openNoteActions(text: string) {
  const row = sidebarText(text).closest('.sb-file');
  if (!row) throw new Error(`note row not found: ${text}`);
  await userEvent.click(within(row as HTMLElement).getByRole('button', { name: `${text} の操作` }));
}
