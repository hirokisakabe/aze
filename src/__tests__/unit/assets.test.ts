import { describe, expect, it } from 'vitest';
import {
  extractAssetIdsFromMarkdown,
  referencedImageAssets,
  rewriteAssetUrlsForExport,
} from '../../assets';
import type { ImageAsset } from '../../db';

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
