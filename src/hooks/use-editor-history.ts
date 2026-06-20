import { useCallback, useState } from 'react';

import {
  commitEditorHistory,
  currentSnapshot,
  initEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorSelection,
  type EditorSnapshot,
} from '../lib/editor-history';

export interface UseEditorHistory {
  draft: string;
  // 現在の履歴位置。undo/redo で値が変わらないケースでも選択範囲復元を確実に走らせるため、
  // 呼び出し側の useLayoutEffect の依存に draft と併せて含める。
  historyIndex: number;
  // 通常入力 (textarea onChange) の確定。短時間の連続入力は 1 エントリにまとめる。
  commitInput: (value: string, selectionStart: number, selectionEnd: number) => void;
  // Tab インデントや画像 Markdown 挿入など、アプリ側で draft を直接置き換える編集の確定。
  commitEdit: (snapshot: EditorSnapshot, beforeSelection: EditorSelection) => void;
  // 別ノートを開く / 新規作成 / 編集開始時に履歴をまっさらにする。
  reset: (value: string) => void;
  // undo / redo。復元後の snapshot を返す (カーソル復元に使う)。変化が無ければ null。
  undo: () => EditorSnapshot | null;
  redo: () => EditorSnapshot | null;
}

export function useEditorHistory(initialValue: string): UseEditorHistory {
  const [state, setState] = useState(() =>
    initEditorHistory({ value: initialValue, selectionStart: 0, selectionEnd: 0 })
  );

  const reset = useCallback((value: string) => {
    setState(
      initEditorHistory({ value, selectionStart: value.length, selectionEnd: value.length })
    );
  }, []);

  const commitInput = useCallback((value: string, selectionStart: number, selectionEnd: number) => {
    setState((prev) =>
      commitEditorHistory(
        prev,
        { value, selectionStart, selectionEnd },
        { kind: 'input', at: Date.now() }
      )
    );
  }, []);

  const commitEdit = useCallback((snapshot: EditorSnapshot, beforeSelection: EditorSelection) => {
    setState((prev) =>
      commitEditorHistory(prev, snapshot, { kind: 'edit', at: Date.now(), beforeSelection })
    );
  }, []);

  // undo/redo はユーザー操作 1 回につき 1 レンダー分の最新 state を起点にすればよいので、
  // setState updater 内で値を取り出さず closure の state から復元 snapshot を返す。
  const undo = useCallback(() => {
    const next = undoEditorHistory(state);
    if (next === state) return null;
    setState(next);
    return currentSnapshot(next);
  }, [state]);

  const redo = useCallback(() => {
    const next = redoEditorHistory(state);
    if (next === state) return null;
    setState(next);
    return currentSnapshot(next);
  }, [state]);

  return {
    draft: currentSnapshot(state).value,
    historyIndex: state.index,
    commitInput,
    commitEdit,
    reset,
    undo,
    redo,
  };
}
