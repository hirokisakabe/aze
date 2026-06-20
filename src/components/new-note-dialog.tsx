import { useEffect, useRef, useState } from 'react';

import { parseNotePath } from '../lib/note-path';

interface NewNoteDialogProps {
  defaultPrefix: string;
  onCreate: (path: string) => void;
  onCancel: () => void;
}

export function NewNoteDialog({ defaultPrefix, onCreate, onCancel }: NewNoteDialogProps) {
  const [val, setVal] = useState(defaultPrefix);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const submit = () => {
    const result = parseNotePath(val);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.path) return;
    onCreate(result.path);
  };
  return (
    <div className="dialog-scrim" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-label">新規ノート</div>
        <div className="dialog-row">
          <input
            ref={ref}
            className="dialog-input"
            value={val}
            placeholder="ideas/new-idea.md"
            spellCheck={false}
            onChange={(e) => {
              setVal(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
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
            パスを入力 → <kbd>Enter</kbd> で作成。フォルダは自動で作られます。
          </div>
        )}
      </div>
    </div>
  );
}
