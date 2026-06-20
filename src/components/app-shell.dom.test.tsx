import { render, screen, fireEvent, within } from '@testing-library/react';
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
import { Sidebar } from './sidebar';

resetStateBeforeEach();

describe('ノートを選択すると本文が表示される', () => {
  it('サイドバーのノートをクリックすると本文が表示される', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await findSidebarText('Note A');
    await userEvent.click(sidebarText('Note B'));

    await screen.findByText('Content of note B.');
  });
});

describe('Tweaks UI は存在しない', () => {
  it('保存済み tweaks と edit-mode postMessage は見た目や UI を変更しない', () => {
    localStorage.setItem(
      'aze:tweaks',
      JSON.stringify({
        vibe: 'editorial',
        sidebar: 'markers',
        measure: 900,
        fontSize: 20,
        accent: '#86705b',
      })
    );

    const { container } = render(<App />);

    fireEvent(window, new MessageEvent('message', { data: { type: '__activate_edit_mode' } }));

    expect(container.querySelector('.app')?.className).toBe('app');
    expect(container.querySelector('.twk-panel')).toBeNull();
    expect(container.querySelector('.sidebar')?.className).toBe('sidebar');
  });
});

describe('サイドバー下部のリンク', () => {
  it('GitHub リポジトリへの外部リンクを表示する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await findSidebarText('Note A');
    const link = within(document.querySelector('.sidebar') as HTMLElement).getByRole('link', {
      name: 'GitHub repository',
    });

    expect(link.getAttribute('href')).toBe('https://github.com/hirokisakabe/aze');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });

  it('マウントディレクトリを省略可能な状態で表示する', () => {
    const mountPath = '/Users/example/projects/very/long/path/to/notes';
    render(
      <Sidebar
        tree={{ name: '', path: '', type: 'folder', children: [] }}
        expanded={new Set()}
        currentPath=""
        onToggle={() => {}}
        onOpen={() => {}}
        onNew={() => {}}
        onExport={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        count={0}
        mountPath={mountPath}
      />
    );

    const mount = screen.getByLabelText(`マウントディレクトリ: ${mountPath}`);
    expect(mount.textContent).toContain(mountPath);
    expect(mount.getAttribute('title')).toBe(mountPath);
  });
});
