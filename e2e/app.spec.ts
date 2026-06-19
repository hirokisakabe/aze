import fs from 'fs';

import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

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

test('whitespace overlay は textarea の位置とスクロールに追従する', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'whitespace-overlay.md');

  const textarea = page.getByRole('textbox');
  await textarea.fill(['alpha beta', '  indent  pair', 'tab\tmarker'].join('\n'));

  const overlayMetrics = await page.locator('.editor-ws-overlay').evaluate((overlay) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.editor-area');
    const dot = overlay.querySelector<HTMLElement>('.ws-dot');
    const tab = overlay.querySelector<HTMLElement>('.ws-tab');
    if (!textarea || !dot || !tab) throw new Error('editor overlay elements are missing');

    const overlayStyle = getComputedStyle(overlay);
    const textareaStyle = getComputedStyle(textarea);
    const dotStyle = getComputedStyle(dot, '::before');
    const tabStyle = getComputedStyle(tab, '::before');
    const overlayRect = overlay.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();

    return {
      sameFontFamily: overlayStyle.fontFamily === textareaStyle.fontFamily,
      sameFontSize: overlayStyle.fontSize === textareaStyle.fontSize,
      sameLineHeight: overlayStyle.lineHeight === textareaStyle.lineHeight,
      sameTabSize: overlayStyle.tabSize === textareaStyle.tabSize,
      contentLeft: overlayRect.left + parseFloat(overlayStyle.paddingLeft),
      contentTop: overlayRect.top + parseFloat(overlayStyle.paddingTop),
      textareaLeft: textareaRect.left,
      textareaTop: textareaRect.top,
      dotText: dot.textContent,
      dotWidth: dotRect.width,
      dotBeforeTop: dotStyle.top,
      dotBeforeLeft: dotStyle.left,
      dotBeforeTransform: dotStyle.transform,
      dotBeforeRadius: dotStyle.borderRadius,
      lineHeight: parseFloat(overlayStyle.lineHeight),
      tabBeforeTop: tabStyle.top,
      tabBeforeTransform: tabStyle.transform,
    };
  });

  expect(overlayMetrics.sameFontFamily).toBe(true);
  expect(overlayMetrics.sameFontSize).toBe(true);
  expect(overlayMetrics.sameLineHeight).toBe(true);
  expect(overlayMetrics.sameTabSize).toBe(true);
  expect(Math.abs(overlayMetrics.contentLeft - overlayMetrics.textareaLeft)).toBeLessThan(0.5);
  expect(Math.abs(overlayMetrics.contentTop - overlayMetrics.textareaTop)).toBeLessThan(0.5);
  expect(overlayMetrics.dotText).toBe(' ');
  expect(overlayMetrics.dotWidth).toBeGreaterThan(0);
  expect(parseFloat(overlayMetrics.dotBeforeTop)).toBeGreaterThan(0);
  expect(parseFloat(overlayMetrics.dotBeforeTop)).toBeLessThan(overlayMetrics.lineHeight);
  expect(parseFloat(overlayMetrics.dotBeforeLeft)).toBeGreaterThan(0);
  expect(overlayMetrics.dotBeforeTransform).not.toBe('none');
  expect(overlayMetrics.dotBeforeRadius).not.toBe('0px');
  expect(parseFloat(overlayMetrics.tabBeforeTop)).toBeGreaterThan(0);
  expect(parseFloat(overlayMetrics.tabBeforeTop)).toBeLessThan(overlayMetrics.lineHeight);
  expect(overlayMetrics.tabBeforeTransform).not.toBe('none');

  await textarea.fill(
    Array.from({ length: 160 }, (_, index) => `line ${index}  with\tspace`).join('\n')
  );
  const scrollTop = await textarea.evaluate((element) => {
    const nextScrollTop = Math.min(240, element.scrollHeight - element.clientHeight);
    element.scrollTop = nextScrollTop;
    element.dispatchEvent(new Event('scroll'));
    return nextScrollTop;
  });

  await expect
    .poll(async () =>
      page.locator('.editor-ws-overlay').evaluate((overlay) => ({
        top: overlay.scrollTop,
      }))
    )
    .toEqual({ top: scrollTop });
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
  expect(download.suggestedFilename()).toBe(`aze-notes-export-${today}.zip`);

  const path = await download.path();
  expect(path).not.toBeNull();

  const data = fs.readFileSync(path);
  const zip = await JSZip.loadAsync(data);
  expect(await zip.file('export-note.md')?.async('string')).toBe('# Export Note\n\nExport me.');
  expect(await zip.file('daily/2024-06-02.md')?.async('string')).toBe(
    '# Daily Note\n\nNested export.'
  );
});

test('アップロードした画像はリロード後も表示され、エクスポート zip に含まれる', async ({
  page,
}) => {
  await page.goto('/');
  await createNote(page, 'image-note.md');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('画像').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]),
  });

  const textarea = page.getByRole('textbox');
  await expect(textarea).toContainText(/!\[diagram\]\(aze-asset:/);
  await page.locator('.bar-save').click();
  await expect(page.getByRole('img', { name: 'diagram' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('img', { name: 'diagram' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('エクスポート').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  const data = fs.readFileSync(path);
  const zip = await JSZip.loadAsync(data);
  const exportedMarkdown = await zip.file('image-note.md')?.async('string');
  expect(exportedMarkdown).toMatch(/!\[diagram\]\(assets\/.+-diagram\.png\)/);
  expect(zip.file(/assets\/.+-diagram\.png/)).toHaveLength(1);
});

test('既存ノートのパスを変更してリロード後も新しいパスで復元される', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'rename-me.md');
  await page.getByRole('textbox').fill('# Rename Me\n\nKeep this body.');
  await page.locator('.bar-save').click();

  const noteRow = page.locator('.sb-file', { hasText: 'Rename Me' });
  await expect(noteRow).toBeVisible();
  await noteRow.getByRole('button', { name: 'Rename Me の操作' }).click();
  await page.getByText('パス変更').click();
  await page.getByPlaceholder('archive/note.md').fill('archive/renamed.md');
  await page.keyboard.press('Enter');

  await expect(page.locator('.crumb')).toContainText('archive');
  await expect(page.locator('.crumb')).toContainText('renamed');
  await expect(page.locator('.sb-folder', { hasText: 'archive' })).toBeVisible();
  await expect(page.getByText('Keep this body.')).toBeVisible();

  await page.reload();

  await expect(page.locator('.crumb')).toContainText('archive');
  await expect(page.locator('.crumb')).toContainText('renamed');
  await expect(page.getByText('Keep this body.')).toBeVisible();
});
