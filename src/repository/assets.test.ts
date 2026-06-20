import { describe, expect, it } from 'vitest';

import {
  assetIdFromMarkdownUrl,
  assetMarkdownUrl,
  exportedAssetPath,
  extractAssetIdsFromMarkdown,
  fsAssetApiUrl,
  fsAssetMarkdownUrl,
  fsAssetPath,
  readableAltText,
  referencedImageAssets,
  resolveFsMarkdownImagePath,
  rewriteAssetUrlsForExport,
} from './assets';

import type { ImageAsset } from '../lib/data';

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
      'assets/asset-b-sub-dir-my-image.png'
    );
  });

  it('クリーンなファイル名が空になる場合は image にフォールバックする', () => {
    expect(exportedAssetPath(asset('asset-c', '???'))).toBe('assets/asset-c-image');
  });
});

describe('filesystem 画像アセットのパス変換', () => {
  it('export と同じ assets ディレクトリ配下に保存パスを生成する', () => {
    expect(fsAssetPath('asset-a', 'diagram.png')).toBe('assets/asset-a-diagram.png');
  });

  it('asset id もファイル名として安全な文字に正規化する', () => {
    expect(fsAssetPath('../asset/a?', 'diagram.png')).toBe('assets/asset-a-diagram.png');
  });

  it('note の階層から assets への相対 Markdown URL を生成する', () => {
    expect(fsAssetMarkdownUrl('note.md', 'assets/asset-a-diagram.png')).toBe(
      'assets/asset-a-diagram.png'
    );
    expect(fsAssetMarkdownUrl('sub/dir/note.md', 'assets/asset-a-diagram.png')).toBe(
      '../../assets/asset-a-diagram.png'
    );
  });

  it('Markdown の相対画像参照を notes root 相対パスへ解決する', () => {
    expect(resolveFsMarkdownImagePath('sub/dir/note.md', '../../assets/image.png')).toBe(
      'assets/image.png'
    );
    expect(resolveFsMarkdownImagePath('sub/note.md', 'assets/local.png')).toBe(
      'sub/assets/local.png'
    );
  });

  it('notes root 外や外部 URL は解決しない', () => {
    expect(resolveFsMarkdownImagePath('note.md', '../escape.png')).toBeNull();
    expect(resolveFsMarkdownImagePath('note.md', 'https://example.com/image.png')).toBeNull();
    expect(resolveFsMarkdownImagePath('note.md', 'aze-asset:asset-a')).toBeNull();
  });

  it('表示用 API URL では path segment を encode する', () => {
    expect(fsAssetApiUrl('sub/note.md', '../assets/my image.png')).toBe(
      '/api/notes/assets/assets/my%20image.png'
    );
  });
});
