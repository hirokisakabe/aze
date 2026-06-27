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

  it('ノート上部の metadata 表示を保ちつつ余分な divider を出さない', async () => {
    await db.notes.put({
      path: 'meta-note.md',
      body: '---\ntitle: Meta Note\nstatus: living\n---\n# Meta Note\n\nBody.',
      created: '2024-01-01',
      updated: '2024-01-02',
    });

    const { container } = render(<App />);

    await screen.findByText('Body.');
    expect(screen.getByText('作成 2024-01-01')).not.toBeNull();
    expect(screen.getByText('更新 2024-01-02')).not.toBeNull();
    expect(container.querySelector('.md-frontmatter')).not.toBeNull();
    expect(container.querySelector('.meta-rule')).toBeNull();
  });

  it('Markdown プレビューの相対リンクからノートへ遷移できる', async () => {
    await db.notes.bulkPut([
      {
        path: 'folder/current.md',
        body: '# Current\n\n[Other](./other.md)\n[Root](../root.md)',
        created: '2024-01-01',
        updated: '2024-01-01',
      },
      {
        path: 'folder/other.md',
        body: '# Other\n\nLinked note.',
        created: '2024-01-01',
        updated: '2024-01-01',
      },
      {
        path: 'root.md',
        body: '# Root\n\nRoot note.',
        created: '2024-01-01',
        updated: '2024-01-01',
      },
    ]);
    render(<App />);

    await screen.findByRole('heading', { name: 'Current' });
    await userEvent.click(screen.getByRole('link', { name: 'Other' }));
    await screen.findByText('Linked note.');

    await userEvent.click(sidebarText('Current'));
    await userEvent.click(screen.getByRole('link', { name: 'Root' }));
    await screen.findByText('Root note.');
  });

  it('存在しない Markdown 相対リンクは未解決リンクとして表示する', async () => {
    await db.notes.put({
      path: 'current.md',
      body: '# Current\n\n[Missing](./missing.md)',
      created: '2024-01-01',
      updated: '2024-01-01',
    });
    render(<App />);

    const missing = await screen.findByRole('link', { name: 'Missing' });
    expect(missing.className).toContain('md-link-missing');
    expect(missing.getAttribute('aria-invalid')).toBe('true');
    expect(missing.getAttribute('data-note-path')).toBe('missing.md');
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
