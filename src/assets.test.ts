import { describe, expect, it } from 'vitest';

import {
  assetIdFromMarkdownUrl,
  assetMarkdownUrl,
  exportedAssetPath,
  extractAssetIdsFromMarkdown,
  readableAltText,
  referencedImageAssets,
  rewriteAssetUrlsForExport,
} from './assets';

import type { ImageAsset } from './data';

function asset(id: string, filename = `${id}.png`): ImageAsset {
  return {
    id,
    notePath: 'note.md',
    filename,
    mimeType: 'image/png',
    blob: new Blob(['image'], { type: 'image/png' }),
    created: '2024-01-01',
  };
}

describe('画像アセットの Markdown 参照', () => {
  it('Markdown 画像記法から aze-asset ID を抽出する', () => {
    expect(
      extractAssetIdsFromMarkdown(
        '![one](aze-asset:asset-a)\n[link](aze-asset:not-image)\n![two](aze-asset:asset-b)'
      )
    ).toEqual(['asset-a', 'asset-b']);
  });

  it('参照されている画像アセットだけを返す', () => {
    const assets = [asset('asset-a'), asset('asset-b'), asset('unused')];

    expect(
      referencedImageAssets(['![one](aze-asset:asset-a)', '![two](aze-asset:asset-b)'], assets).map(
        (item) => item.id
      )
    ).toEqual(['asset-a', 'asset-b']);
  });

  it('エクスポート時に存在する画像参照だけ zip 内パスへ書き換える', () => {
    const markdown = '![diagram](aze-asset:asset-a)\n![missing](aze-asset:missing)';

    expect(rewriteAssetUrlsForExport(markdown, [asset('asset-a', 'diagram.png')])).toBe(
      '![diagram](assets/asset-a-diagram.png)\n![missing](aze-asset:missing)'
    );
  });
});

describe('aze-asset Markdown URL の変換', () => {
  it('assetMarkdownUrl と assetIdFromMarkdownUrl が round-trip する', () => {
    const id = 'asset-123';
    const url = assetMarkdownUrl(id);

    expect(url).toBe('aze-asset:asset-123');
    expect(assetIdFromMarkdownUrl(url)).toBe(id);
  });

  it('aze-asset 形式でない URL では null を返す', () => {
    expect(assetIdFromMarkdownUrl('https://example.com/image.png')).toBeNull();
    expect(assetIdFromMarkdownUrl('asset-123')).toBeNull();
    expect(assetIdFromMarkdownUrl('')).toBeNull();
  });

  it('undefined の入力でも安全に null を返す', () => {
    expect(assetIdFromMarkdownUrl(undefined)).toBeNull();
    expect(assetIdFromMarkdownUrl()).toBeNull();
  });
});

describe('readableAltText', () => {
  it('拡張子を除いてアンダースコア・ハイフンを空白に変換する', () => {
    expect(readableAltText('my_photo-2024.png')).toBe('my photo 2024');
  });

  it('拡張子のみを除いた素朴なファイル名をそのまま使う', () => {
    expect(readableAltText('diagram.png')).toBe('diagram');
  });

  it('拡張子を取り除くと空になる場合はフォールバック文言を返す', () => {
    expect(readableAltText('.png')).toBe('uploaded image');
    expect(readableAltText('___.png')).toBe('uploaded image');
  });
});

describe('exportedAssetPath', () => {
  it('assets ディレクトリ配下に id 付きのファイル名を生成する', () => {
    expect(exportedAssetPath(asset('asset-a', 'diagram.png'))).toBe('assets/asset-a-diagram.png');
  });

  it('パス区切りや不正文字を取り除いたファイル名にする', () => {
    expect(exportedAssetPath(asset('asset-b', 'sub/dir/my image?.png'))).toBe(
      'assets/asset-b-sub-dir-my image.png'
    );
  });

  it('クリーンなファイル名が空になる場合は image にフォールバックする', () => {
    expect(exportedAssetPath(asset('asset-c', '???'))).toBe('assets/asset-c-image');
  });
});
