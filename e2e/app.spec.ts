import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import fs from "fs";

test("アプリを開いてノートが表示される", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("aze")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".sb-tree")).toBeVisible();

  const noteItems = page.locator(".sb-file");
  await expect(noteItems.first()).toBeVisible({ timeout: 5000 });
});

test("ノートを編集して保存し、リロード後も内容が保持される", async ({ page }) => {
  await page.goto("/");

  const noteLink = page.locator(".sb-file").first();
  await expect(noteLink).toBeVisible({ timeout: 5000 });
  await noteLink.click();

  await page.locator(".edit-fab").click();
  const textarea = page.getByRole("textbox");
  await expect(textarea).toBeVisible();

  const testContent = "# Persistent Note\n\nThis content should survive reload.";
  await textarea.fill(testContent);
  await page.locator(".bar-save").click();

  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.getByText("This content should survive reload.")).toBeVisible();

  await page.reload();

  await expect(page.locator(".sb-file").first()).toBeVisible({ timeout: 5000 });
  const firstNote = page.locator(".sb-file").first();
  await firstNote.click();
  await expect(page.getByText("This content should survive reload.")).toBeVisible();
});

test("エクスポートボタンで zip がダウンロードされる", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".sb-file").first()).toBeVisible({ timeout: 5000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("エクスポート").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("notes.zip");

  const path = await download.path();
  expect(path).not.toBeNull();

  const data = fs.readFileSync(path!);
  const zip = await JSZip.loadAsync(data);
  const entries = Object.keys(zip.files);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.some((e) => e.endsWith(".md"))).toBe(true);
});
