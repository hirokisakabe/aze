import { useEffect, useRef, useState } from 'react';

import { parseNotePath } from '../lib/note-path';

interface RenameNoteDialogProps {
  initialPath: string;
  onRename: (path: string) => Promise<string | null>;
  onCancel: () => void;
}

export function RenameNoteDialog({ initialPath, onRename, onCancel }: RenameNoteDialogProps) {
  const [val, setVal] = useState(initialPath);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = async () => {
    const result = parseNotePath(val);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.path) return;
    const message = await onRename(result.path);
    if (message) {
      setError(message);
      return;
    }
    onCancel();
  };

  return (
    <div className="dialog-scrim" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-label">パス変更</div>
        <div className="dialog-row">
          <input
            ref={ref}
            className="dialog-input"
            value={val}
            placeholder="archive/note.md"
            spellCheck={false}
            onChange={(e) => {
              setVal(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>
        {error ? (
          <div className="dialog-error" role="alert">
            {error}
          </div>
        ) : (
          <div className="dialog-hint">
            ファイル名またはフォルダを含むパスを入力 → <kbd>Enter</kbd> で変更。
          </div>
        )}
      </div>
    </div>
  );
}
