// editor 専用の undo/redo 履歴。draft の値とカーソル/選択範囲を 1 つの snapshot として
// 直線的なスタックで管理する。通常入力 (input) は短時間の連続入力を 1 エントリにまとめ、
// Tab インデントや画像 Markdown 挿入 (edit) は常に独立したエントリとして積む。

export interface EditorSnapshot {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface EditorSelection {
  start: number;
  end: number;
}

// commit の種別。連続入力のまとめ判定と、undo/redo 後の境界判定に使う。
type CommitKind = 'input' | 'edit' | 'nav';

export interface EditorHistoryState {
  entries: EditorSnapshot[];
  index: number;
  lastKind: CommitKind;
  lastCommitAt: number;
}

export interface CommitOptions {
  kind: 'input' | 'edit';
  at: number;
  // edit 実行直前の選択範囲。undo でカーソル/選択範囲を自然に復元するため、
  // 1 つ前の (= edit 前の) エントリの選択範囲をこの値で上書きする。
  beforeSelection?: EditorSelection;
}

// 連続入力を 1 つの undo エントリにまとめる時間窓 (ms)。
// この窓を超えて入力が途切れたら新しいエントリとして区切る。
export const COALESCE_WINDOW_MS = 500;

export function initEditorHistory(snapshot: EditorSnapshot): EditorHistoryState {
  return { entries: [snapshot], index: 0, lastKind: 'nav', lastCommitAt: 0 };
}

export function currentSnapshot(state: EditorHistoryState): EditorSnapshot {
  return state.entries[state.index];
}

export function canUndo(state: EditorHistoryState): boolean {
  return state.index > 0;
}

export function canRedo(state: EditorHistoryState): boolean {
  return state.index < state.entries.length - 1;
}

export function commitEditorHistory(
  state: EditorHistoryState,
  snapshot: EditorSnapshot,
  options: CommitOptions
): EditorHistoryState {
  const { kind, at, beforeSelection } = options;

  // redo 用に残っていた未来エントリは新しい編集で破棄する。
  const base = state.entries.slice(0, state.index + 1);

  // edit 直前の選択範囲を 1 つ前のエントリに反映しておくと、
  // undo でその編集を取り消したときにカーソル位置が自然に戻る。
  if (beforeSelection) {
    base[state.index] = {
      ...base[state.index],
      selectionStart: beforeSelection.start,
      selectionEnd: beforeSelection.end,
    };
  }

  const coalesce =
    kind === 'input' && state.lastKind === 'input' && at - state.lastCommitAt <= COALESCE_WINDOW_MS;

  if (coalesce) {
    // 直近の入力エントリ (= スタック先端) を新しい値で置き換えてまとめる。
    const entries = base.slice();
    entries[state.index] = snapshot;
    return { entries, index: state.index, lastKind: kind, lastCommitAt: at };
  }

  const entries = [...base, snapshot];
  return { entries, index: entries.length - 1, lastKind: kind, lastCommitAt: at };
}

export function undoEditorHistory(state: EditorHistoryState): EditorHistoryState {
  if (!canUndo(state)) return state;
  // undo 直後の入力は historical エントリへ coalesce させず新エントリにするため nav 扱い。
  return { ...state, index: state.index - 1, lastKind: 'nav' };
}

export function redoEditorHistory(state: EditorHistoryState): EditorHistoryState {
  if (!canRedo(state)) return state;
  return { ...state, index: state.index + 1, lastKind: 'nav' };
}
