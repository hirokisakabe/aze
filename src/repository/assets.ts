import type { ImageAsset } from '../lib/data';

const ASSET_URL_PREFIX = 'aze-asset:';
const EXPORTED_ASSET_DIR = 'assets';

export function createAssetId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function assetMarkdownUrl(id: string) {
  return `${ASSET_URL_PREFIX}${id}`;
}

export function assetIdFromMarkdownUrl(src?: string) {
  if (!src?.startsWith(ASSET_URL_PREFIX)) return null;
  return src.slice(ASSET_URL_PREFIX.length);
}

export function readableAltText(filename: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const normalized = withoutExtension.replace(/[_-]+/g, ' ').trim();
  return normalized || 'uploaded image';
}

function safeExportFilename(asset: ImageAsset) {
  return safeAssetFilename(asset.id, asset.filename);
}

function safeAssetFilename(id: string, filename: string) {
  const cleanId =
    id
      .replace(/[\\/]/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/^-+|-+$/g, '') || 'asset';
  const cleanName = filename
    .replace(/[\\/]/g, '-')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${cleanId}-${cleanName || 'image'}`;
}

export function exportedAssetPath(asset: ImageAsset) {
  return `${EXPORTED_ASSET_DIR}/${safeExportFilename(asset)}`;
}

export function fsAssetPath(id: string, filename: string) {
  return `${EXPORTED_ASSET_DIR}/${safeAssetFilename(id, filename)}`;
}

function pathParts(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function normalizeRelativePath(parts: string[]): string[] | null {
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (normalized.length === 0) return null;
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized;
}

function splitUrlSuffix(src: string): { path: string; suffix: string } {
  const query = src.indexOf('?');
  const hash = src.indexOf('#');
  const cut = query === -1 ? hash : hash === -1 ? query : query < hash ? query : hash;
  if (cut === -1) return { path: src, suffix: '' };
  return { path: src.slice(0, cut), suffix: src.slice(cut) };
}

function isRelativeMarkdownImageUrl(src: string): boolean {
  if (!src || src.startsWith('/') || src.startsWith('//') || src.includes('\\')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(src);
}

export function fsAssetMarkdownUrl(notePath: string, assetPath: string) {
  const noteDir = pathParts(notePath).slice(0, -1);
  const assetParts = pathParts(assetPath);
  let common = 0;
  while (common < noteDir.length && noteDir[common] === assetParts[common]) {
    common += 1;
  }
  const up = noteDir.slice(common).map(() => '..');
  return [...up, ...assetParts.slice(common)].join('/') || assetPath;
}

export function resolveFsMarkdownImagePath(notePath: string, src?: string) {
  if (!src) return null;
  const { path } = splitUrlSuffix(src);
  if (!isRelativeMarkdownImageUrl(path)) return null;
  const noteDir = pathParts(notePath).slice(0, -1);
  const normalized = normalizeRelativePath([...noteDir, ...pathParts(path)]);
  return normalized?.join('/') || null;
}

export function fsAssetApiUrl(notePath: string, src?: string) {
  if (!src) return undefined;
  const { suffix } = splitUrlSuffix(src);
  const resolved = resolveFsMarkdownImagePath(notePath, src);
  if (!resolved) return undefined;
  const encodedPath = resolved.split('/').map(encodeURIComponent).join('/');
  return `/api/notes/assets/${encodedPath}${suffix}`;
}

export function extractAssetIdsFromMarkdown(markdown: string) {
  return Array.from(markdown.matchAll(/!\[[^\]]*\]\(aze-asset:([^)]+)\)/g), (match) => match[1]);
}

export function referencedImageAssets(markdowns: string[], assets: ImageAsset[]) {
  const referencedAssetIds = new Set(markdowns.flatMap(extractAssetIdsFromMarkdown));
  return assets.filter((asset) => referencedAssetIds.has(asset.id));
}

export function rewriteAssetUrlsForExport(markdown: string, assets: ImageAsset[]) {
  const pathById = new Map(assets.map((asset) => [asset.id, exportedAssetPath(asset)]));
  return markdown.replace(
    /!\[([^\]]*)\]\(aze-asset:([^)]+)\)/g,
    (match: string, alt: string, id: string) => {
      const path = pathById.get(id);
      return path ? `![${alt}](${path})` : match;
    }
  );
}
