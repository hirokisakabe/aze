import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'fs';

async function createNote(page: import('@playwright/test').Page, path: string) {
  await page.getByLabel('新規ノート').click();
  await page.getByPlaceholder('ideas/new-idea.md').fill(path);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox')).toBeVisible();
}

test('初回起動は空のノート一覧から新規ノートを作成できる', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('aze')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sb-tree')).toBeVisible();
  await expect(page.locator('.sb-file')).toHaveCount(0);
  await expect(page.getByText('ノートを選択')).toBeVisible();

  await createNote(page, 'first-note.md');

  await expect(page.locator('.sb-file')).toHaveCount(1);
  await expect(page.locator('.sb-file', { hasText: 'first-note' })).toBeVisible();
});

test('ノートを編集して保存し、リロード後も内容が保持される', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'persistent-note.md');
  await page.locator('.bar-save').click();

  const noteLink = page.locator('.sb-file').first();
  await expect(noteLink).toBeVisible({ timeout: 5000 });
  await noteLink.click();

  await page.locator('.edit-fab').click();
  const textarea = page.getByRole('textbox');
  await expect(textarea).toBeVisible();

  const testContent = '# Persistent Note\n\nThis content should survive reload.';
  await textarea.fill(testContent);
  await page.locator('.bar-save').click();

  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.getByText('This content should survive reload.')).toBeVisible();

  await page.reload();

  await expect(page.locator('.sb-file').first()).toBeVisible({ timeout: 5000 });
  const firstNote = page.locator('.sb-file').first();
  await firstNote.click();
  await expect(page.getByText('This content should survive reload.')).toBeVisible();
});

test('エクスポートボタンで zip がダウンロードされる', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'export-note.md');
  await page.getByRole('textbox').fill('# Export Note\n\nExport me.');
  await page.locator('.bar-save').click();
  await createNote(page, 'daily/2024-06-02.md');
  await page.getByRole('textbox').fill('# Daily Note\n\nNested export.');
  await page.locator('.bar-save').click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('エクスポート').click();
  const download = await downloadPromise;

  const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
  expect(download.suggestedFilename()).toBe(`notes-export-${today}.zip`);

  const path = await download.path();
  expect(path).not.toBeNull();

  const data = fs.readFileSync(path!);
  const zip = await JSZip.loadAsync(data);
  expect(await zip.file('export-note.md')?.async('string')).toBe('# Export Note\n\nExport me.');
  expect(await zip.file('daily/2024-06-02.md')?.async('string')).toBe(
    '# Daily Note\n\nNested export.'
  );
});
