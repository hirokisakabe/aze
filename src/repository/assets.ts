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
  const cleanName = asset.filename
    .replace(/[\\/]/g, '-')
    .replace(/[^\w.\- ]+/g, '')
    .trim();
  return `${asset.id}-${cleanName || 'image'}`;
}

export function exportedAssetPath(asset: ImageAsset) {
  return `${EXPORTED_ASSET_DIR}/${safeExportFilename(asset)}`;
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
