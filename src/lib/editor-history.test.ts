import { describe, it, expect } from 'vitest';

import {
  COALESCE_WINDOW_MS,
  canRedo,
  canUndo,
  commitEditorHistory,
  currentSnapshot,
  initEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorHistoryState,
  type EditorSnapshot,
} from './editor-history';

function snap(
  value: string,
  selectionStart = value.length,
  selectionEnd = selectionStart
): EditorSnapshot {
  return { value, selectionStart, selectionEnd };
}

function commitInput(state: EditorHistoryState, value: string, at: number): EditorHistoryState {
  return commitEditorHistory(state, snap(value), { kind: 'input', at });
}

describe('editor-history reducer', () => {
  it('初期状態は undo も redo もできない', () => {
    const state = initEditorHistory(snap('hello'));
    expect(currentSnapshot(state).value).toBe('hello');
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it('時間窓を超えた入力は別エントリになり 1 段ずつ undo できる', () => {
    let state = initEditorHistory(snap('a'));
    state = commitInput(state, 'ab', 0);
    state = commitInput(state, 'abc', COALESCE_WINDOW_MS + 1);

    expect(currentSnapshot(state).value).toBe('abc');
    state = undoEditorHistory(state);
    expect(currentSnapshot(state).value).toBe('ab');
    state = undoEditorHistory(state);
    expect(currentSnapshot(state).value).toBe('a');
    expect(canUndo(state)).toBe(false);
  });

  it('時間窓内の連続入力は 1 エントリにまとめられる', () => {
    let state = initEditorHistory(snap(''));
    state = commitInput(state, 'h', 0);
    state = commitInput(state, 'he', 10);
    state = commitInput(state, 'hel', 20);
    state = commitInput(state, 'hell', 30);
    state = commitInput(state, 'hello', 40);

    expect(currentSnapshot(state).value).toBe('hello');
    // 1 回の undo で入力前の空文字に戻る
    state = undoEditorHistory(state);
    expect(currentSnapshot(state).value).toBe('');
    expect(canUndo(state)).toBe(false);
  });

  it('edit (Tab/画像挿入) は常に独立エントリで、beforeSelection が 1 つ前へ反映される', () => {
    let state = initEditorHistory(snap('first\nsecond', 7, 7));
    state = commitEditorHistory(
      state,
      { value: 'first\n  second', selectionStart: 9, selectionEnd: 9 },
      { kind: 'edit', at: 0, beforeSelection: { start: 7, end: 7 } }
    );

    expect(currentSnapshot(state)).toEqual({
      value: 'first\n  second',
      selectionStart: 9,
      selectionEnd: 9,
    });

    const undone = undoEditorHistory(state);
    expect(currentSnapshot(undone)).toEqual({
      value: 'first\nsecond',
      selectionStart: 7,
      selectionEnd: 7,
    });

    const redone = redoEditorHistory(undone);
    expect(currentSnapshot(redone)).toEqual({
      value: 'first\n  second',
      selectionStart: 9,
      selectionEnd: 9,
    });
  });

  it('複数行選択の edit でも選択範囲が undo/redo で復元される', () => {
    let state = initEditorHistory(snap('alpha\nbeta\ngamma', 1, 10));
    state = commitEditorHistory(
      state,
      { value: '  alpha\n  beta\ngamma', selectionStart: 3, selectionEnd: 14 },
      { kind: 'edit', at: 0, beforeSelection: { start: 1, end: 10 } }
    );

    const undone = undoEditorHistory(state);
    expect(currentSnapshot(undone)).toEqual({
      value: 'alpha\nbeta\ngamma',
      selectionStart: 1,
      selectionEnd: 10,
    });
    const redone = redoEditorHistory(undone);
    expect(currentSnapshot(redone).selectionStart).toBe(3);
    expect(currentSnapshot(redone).selectionEnd).toBe(14);
  });

  it('undo 後に新しい編集をすると redo 履歴が破棄される', () => {
    let state = initEditorHistory(snap('a'));
    state = commitInput(state, 'ab', 0);
    state = commitInput(state, 'abc', COALESCE_WINDOW_MS + 1);
    state = undoEditorHistory(state); // 'ab'
    expect(canRedo(state)).toBe(true);

    state = commitInput(state, 'abX', COALESCE_WINDOW_MS * 3);
    expect(canRedo(state)).toBe(false);
    expect(currentSnapshot(state).value).toBe('abX');
    state = undoEditorHistory(state);
    expect(currentSnapshot(state).value).toBe('ab');
  });

  it('undo 直後の入力は復元エントリへ coalesce されず新エントリになる', () => {
    let state = initEditorHistory(snap(''));
    state = commitInput(state, 'foo', 0);
    state = undoEditorHistory(state); // ''
    // 時間窓内でもまとめず、入力前の '' を残す
    state = commitInput(state, 'bar', 5);
    expect(currentSnapshot(state).value).toBe('bar');
    state = undoEditorHistory(state);
    expect(currentSnapshot(state).value).toBe('');
  });

  it('reset で履歴がまっさらになる', () => {
    let state = initEditorHistory(snap('a'));
    state = commitInput(state, 'ab', 0);
    state = initEditorHistory(snap('other note'));
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
    expect(currentSnapshot(state).value).toBe('other note');
  });
});
