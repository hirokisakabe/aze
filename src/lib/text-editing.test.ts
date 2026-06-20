import { isValidElement } from 'react';
import { describe, it, expect } from 'vitest';

import { indentText, lineBoundsForSelection, renderWsOverlay, unindentText } from './text-editing';

describe('lineBoundsForSelection', () => {
  it('単一行のキャレットはその行全体を範囲とする', () => {
    expect(lineBoundsForSelection('abc', 1, 1)).toEqual({ lineStart: 0, lineEnd: 3 });
  });

  it('複数行の選択は開始行頭から終了行末までを範囲とする', () => {
    expect(lineBoundsForSelection('a\nb\nc', 0, 3)).toEqual({ lineStart: 0, lineEnd: 3 });
  });

  it('選択末尾が改行直後の場合は手前の行を範囲に含めない', () => {
    // 'a\nb\n' を 0..2 (a と改行) 選択 → b の行は対象外
    expect(lineBoundsForSelection('a\nb\n', 0, 2)).toEqual({ lineStart: 0, lineEnd: 1 });
  });
});

describe('indentText', () => {
  it('キャレット位置の行頭にインデントを挿入し選択位置をずらす', () => {
    expect(indentText('abc', 0, 0)).toEqual({ value: '  abc', selectionStart: 2, selectionEnd: 2 });
  });

  it('複数行選択は各行にインデントを挿入し選択範囲を拡張する', () => {
    expect(indentText('a\nb', 0, 3)).toEqual({
      value: '  a\n  b',
      selectionStart: 2,
      selectionEnd: 7,
    });
  });
});

describe('unindentText', () => {
  it('行頭のインデントを取り除き選択位置を補正する', () => {
    expect(unindentText('  abc', 0, 5)).toEqual({
      value: 'abc',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });

  it('インデントが無い行はそのまま、ある行だけ取り除く', () => {
    expect(unindentText('a\n  b', 0, 5)).toEqual({
      value: 'a\nb',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });

  it('インデント未満の単一スペースも 1 文字だけ取り除く', () => {
    expect(unindentText(' abc', 0, 4)).toEqual({
      value: 'abc',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });
});

describe('renderWsOverlay', () => {
  it('空白を含まないテキストは透明な span 1 つにまとめる', () => {
    const nodes = renderWsOverlay('abc');
    expect(nodes).toHaveLength(1);
    const [span] = nodes;
    expect(isValidElement(span)).toBe(true);
    const props = (span as { props: { children: string; style?: { color: string } } }).props;
    expect(props.children).toBe('abc');
    expect(props.style?.color).toBe('transparent');
  });

  it('半角スペースは ws-dot クラスの span として描画する', () => {
    const nodes = renderWsOverlay('a b');
    expect(nodes).toHaveLength(3);
    const classNames = nodes.map((n) => (n as { props: { className?: string } }).props.className);
    expect(classNames[1]).toBe('ws-dot');
  });

  it('タブは ws-tab クラスの span として描画する', () => {
    const nodes = renderWsOverlay('\t');
    expect(nodes).toHaveLength(1);
    expect((nodes[0] as { props: { className?: string } }).props.className).toBe('ws-tab');
  });
});
