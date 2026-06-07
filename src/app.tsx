import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import JSZip from 'jszip';
import { buildTree, ancestorsOf } from './data';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MarkdownPreview } from './markdown';
import { Sidebar } from './sidebar';
import {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRadio,
  TweakSlider,
  TweakColor,
} from './tweaks-panel';

const TODAY = new Intl.DateTimeFormat('sv-SE').format(new Date());

const TWEAK_DEFAULTS = {
  vibe: 'editor',
  sidebar: 'compact',
  measure: 1200,
  fontSize: 17,
  accent: '#5b6b86',
};

const VIBE_LABELS: Record<string, string> = {
  quiet: '静かな紙',
  editor: 'エディタ',
  editorial: '雑誌',
};
const SIDEBAR_LABELS: Record<string, string> = {
  minimal: 'ミニマル',
  guides: 'ガイド線',
  markers: 'マーカー',
  compact: 'コンパクト',
};

function renderWsOverlay(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buf = '';
  let k = 0;
  const flush = () => {
    if (!buf) return;
    out.push(
      <span key={k++} style={{ color: 'transparent' }}>
        {buf}
      </span>
    );
    buf = '';
  };
  for (const ch of text) {
    if (ch === ' ') {
      flush();
      out.push(
        <span key={k++} className="ws-dot">
          ·
        </span>
      );
    } else if (ch === '\t') {
      flush();
      out.push(
        <span key={k++} className="ws-tab">
          {'\t'}
        </span>
      );
    } else {
      buf += ch;
    }
  }
  flush();
  return out;
}

const INDENT = '  ';

interface IndentResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function lineBoundsForSelection(value: string, selectionStart: number, selectionEnd: number) {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const adjustedEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
      ? selectionEnd - 1
      : selectionEnd;
  const nextLineBreak = value.indexOf('\n', adjustedEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return { lineStart, lineEnd };
}

function indentText(value: string, selectionStart: number, selectionEnd: number): IndentResult {
  const { lineStart, lineEnd } = lineBoundsForSelection(value, selectionStart, selectionEnd);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const indented = lines.map((line) => `${INDENT}${line}`).join('\n');
  const inserted = lines.length * INDENT.length;
  return {
    value: value.slice(0, lineStart) + indented + value.slice(lineEnd),
    selectionStart: selectionStart + INDENT.length,
    selectionEnd:
      selectionStart === selectionEnd ? selectionEnd + INDENT.length : selectionEnd + inserted,
  };
}

function unindentText(value: string, selectionStart: number, selectionEnd: number): IndentResult {
  const { lineStart, lineEnd } = lineBoundsForSelection(value, selectionStart, selectionEnd);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  let cursor = lineStart;
  let selectionStartOffset = 0;
  let selectionEndOffset = 0;

  const unindented = lines
    .map((line) => {
      const removeCount = line.startsWith(INDENT) ? INDENT.length : line.startsWith(' ') ? 1 : 0;
      const removeStart = cursor;
      const removeEnd = cursor + removeCount;
      if (removeCount > 0) {
        if (removeEnd <= selectionStart) selectionStartOffset += removeCount;
        else if (removeStart < selectionStart) selectionStartOffset += selectionStart - removeStart;
        if (removeEnd <= selectionEnd) selectionEndOffset += removeCount;
        else if (removeStart < selectionEnd) selectionEndOffset += selectionEnd - removeStart;
      }
      cursor += line.length + 1;
      return line.slice(removeCount);
    })
    .join('\n');

  return {
    value: value.slice(0, lineStart) + unindented + value.slice(lineEnd),
    selectionStart: Math.max(lineStart, selectionStart - selectionStartOffset),
    selectionEnd: Math.max(lineStart, selectionEnd - selectionEndOffset),
  };
}

interface BreadcrumbProps {
  path: string;
}

function Breadcrumb({ path }: BreadcrumbProps) {
  const parts = path.replace(/\.md$/, '').split('/');
  return (
    <div className="crumb">
      <span className="crumb-bracket">[</span>
      {parts.map((p, i) => (
        <span className="crumb-seg" key={i}>
          {i > 0 && <span className="crumb-sep">/</span>}
          <span className={i === parts.length - 1 ? 'crumb-leaf' : ''}>{p}</span>
        </span>
      ))}
      <span className="crumb-bracket">]</span>
    </div>
  );
}

function getParentFolder(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? '' : path.slice(0, lastSlash + 1);
}

interface ParsedNotePath {
  path: string;
  error: string;
}

function parseNotePath(path: string): ParsedNotePath {
  let nextPath = path.trim();
  if (!nextPath) return { path: '', error: '' };
  nextPath = nextPath.replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!nextPath || nextPath.endsWith('/')) {
    return { path: '', error: 'ファイル名を含むパスを入力してください。' };
  }
  if (nextPath.split('/').some((part) => part === '.' || part === '..')) {
    return { path: '', error: '「.」または「..」を含むパスは使えません。' };
  }
  if (!nextPath.endsWith('.md')) nextPath += '.md';
  return { path: nextPath, error: '' };
}

interface NewNoteDialogProps {
  defaultPrefix: string;
  onCreate: (path: string) => void;
  onCancel: () => void;
}

function NewNoteDialog({ defaultPrefix, onCreate, onCancel }: NewNoteDialogProps) {
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
          <span className="dialog-prefix">~/notes/</span>
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

interface RenameNoteDialogProps {
  initialPath: string;
  onRename: (path: string) => Promise<string | null>;
  onCancel: () => void;
}

function RenameNoteDialog({ initialPath, onRename, onCancel }: RenameNoteDialogProps) {
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
          <span className="dialog-prefix">~/notes/</span>
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
            ファイル名またはフォルダを含むパスを入力 → <kbd>Enter</kbd> で変更。
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const rawNotes = useLiveQuery(() => db.notes.toArray(), []);
  const notes = useMemo(() => rawNotes ?? [], [rawNotes]);
  const [currentPath, setCurrentPath] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<Pick<IndentResult, 'selectionStart' | 'selectionEnd'> | null>(
    null
  );
  const pathInitializedRef = useRef(false);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const current = useMemo(() => notes.find((n) => n.path === currentPath), [notes, currentPath]);

  const openNote = useCallback(
    async (path: string) => {
      if (mode === 'edit' && current && path !== currentPath && draft !== current.body) {
        try {
          await db.notes.put({ ...current, body: draft, updated: TODAY });
        } catch {
          return;
        }
      }
      setCurrentPath(path);
      setMode('view');
      setExpanded(new Set(ancestorsOf(path)));
    },
    [mode, current, currentPath, draft]
  );

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (pathInitializedRef.current || notes.length === 0) return;
    pathInitializedRef.current = true;
    db.settings.get('lastOpenedPath').then((setting) => {
      const saved = setting?.value;
      const path = saved && notes.some((n) => n.path === saved) ? saved : notes[0].path;
      setCurrentPath(path);
      setExpanded(new Set(ancestorsOf(path)));
    });
  }, [notes]);

  useEffect(() => {
    if (!currentPath) return;
    db.settings.put({ key: 'lastOpenedPath', value: currentPath });
  }, [currentPath]);

  const enterEdit = useCallback(() => {
    if (!current) return;
    setDraft(current.body);
    setMode('edit');
  }, [current]);

  const saveEdit = useCallback(async () => {
    if (!current) return;
    await db.notes.put({ ...current, body: draft, updated: TODAY });
    setMode('view');
  }, [draft, current]);

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    if (!pendingSelection) return;
    pendingSelectionRef.current = null;
    taRef.current?.setSelectionRange(
      pendingSelection.selectionStart,
      pendingSelection.selectionEnd
    );
  }, [draft]);

  const updateTextareaIndent = useCallback((shiftKey: boolean) => {
    const textarea = taRef.current;
    if (!textarea) return;
    const next = shiftKey
      ? unindentText(textarea.value, textarea.selectionStart, textarea.selectionEnd)
      : indentText(textarea.value, textarea.selectionStart, textarea.selectionEnd);
    if (next.value === textarea.value) {
      pendingSelectionRef.current = null;
      textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
      return;
    }
    pendingSelectionRef.current = {
      selectionStart: next.selectionStart,
      selectionEnd: next.selectionEnd,
    };
    setDraft(next.value);
  }, []);

  const cancelEdit = useCallback(() => setMode('view'), []);

  const createNote = useCallback(
    async (path: string) => {
      setCreating(false);
      const exists = await db.notes.get(path);
      if (exists) {
        openNote(path);
        return;
      }
      const base = path.split('/').pop()!.replace(/\.md$/, '');
      const body = `# ${base}\n\n`;
      await db.notes.put({ path, created: TODAY, updated: TODAY, body });
      setCurrentPath(path);
      setExpanded(new Set(ancestorsOf(path)));
      setDraft(body);
      setMode('edit');
    },
    [openNote]
  );

  const deleteNote = useCallback(
    async (path: string) => {
      await db.notes.delete(path);
      if (currentPath === path) {
        const remaining = notes.filter((n) => n.path !== path);
        if (remaining.length > 0) {
          setCurrentPath(remaining[0].path);
          setExpanded(new Set(ancestorsOf(remaining[0].path)));
        } else {
          setCurrentPath('');
        }
        setMode('view');
      }
    },
    [currentPath, notes]
  );

  const renameNote = useCallback(
    async (oldPath: string, newPath: string) => {
      if (oldPath === newPath) return null;
      const note = notes.find((n) => n.path === oldPath);
      if (!note) return '変更対象のノートが見つかりません。';
      const exists = await db.notes.get(newPath);
      if (exists) return `「${newPath}」は既に存在します。`;

      const renamed = { ...note, path: newPath };

      await db.transaction('rw', db.notes, db.settings, async () => {
        await db.notes.put(renamed);
        await db.notes.delete(oldPath);
        if (oldPath === currentPath) {
          await db.settings.put({ key: 'lastOpenedPath', value: newPath });
        }
      });

      if (oldPath === currentPath) {
        setCurrentPath(newPath);
        setExpanded(new Set(ancestorsOf(newPath)));
      }
      return null;
    },
    [currentPath, notes]
  );

  const exportNotes = useCallback(async () => {
    const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
    const zip = new JSZip();
    const all = await db.notes.toArray();
    for (const note of all) {
      zip.file(note.path, note.body);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-export-${today}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  useEffect(() => {
    if (mode === 'edit' && taRef.current) {
      const ta = taRef.current;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [mode]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const sync = () => {
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.scrollTop = ta.scrollTop;
        overlay.scrollLeft = ta.scrollLeft;
      }
    };
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (mode === 'view' && !creating) {
        if ((e.key === 'e' || e.key === 'E') && !typing && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          enterEdit();
        }
        if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setCreating(true);
        }
      } else if (mode === 'edit') {
        if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
          e.preventDefault();
          saveEdit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, creating, enterEdit, saveEdit, cancelEdit]);

  return (
    <div
      className={'app vibe-' + t.vibe}
      style={
        {
          '--measure': t.measure + 'px',
          '--body-size': t.fontSize + 'px',
          '--accent': t.accent,
        } as CSSProperties
      }
    >
      <Sidebar
        tree={tree}
        expanded={expanded}
        currentPath={currentPath}
        onToggle={toggleFolder}
        onOpen={openNote}
        onNew={() => setCreating(true)}
        onExport={exportNotes}
        onDelete={deleteNote}
        onRename={setRenamingPath}
        variant={t.sidebar}
        count={notes.length}
      />

      <main className="main">
        {current ? (
          mode === 'view' ? (
            <div className="reader" key={currentPath}>
              <div className="reader-inner">
                <Breadcrumb path={current.path} />
                <div className="meta">
                  <div className="meta-dates">
                    <span>作成 {current.created}</span>
                    <span className="meta-dot">/</span>
                    <span>更新 {current.updated}</span>
                  </div>
                  <div className="meta-rule" />
                </div>
                <article className="doc">
                  {current && <MarkdownPreview content={current.body} />}
                </article>
              </div>
              <button className="edit-fab" onClick={enterEdit} title="編集 (E)">
                <span className="fab-key">E</span> 編集
              </button>
            </div>
          ) : (
            <div className="editor">
              <div className="editor-inner">
                <Breadcrumb path={current.path} />
                <div className="editor-area-wrap">
                  <div ref={overlayRef} className="editor-ws-overlay" aria-hidden="true">
                    {renderWsOverlay(draft)}
                  </div>
                  <textarea
                    ref={taRef}
                    className="editor-area"
                    value={draft}
                    spellCheck={false}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Tab') return;
                      e.preventDefault();
                      updateTextareaIndent(e.shiftKey);
                    }}
                  />
                </div>
              </div>
              <div className="editor-bar">
                <span className="bar-mode">編集中</span>
                <span className="bar-spacer" />
                <span className="bar-hint">
                  <kbd>esc</kbd> 取消
                </span>
              </div>
              <button className="bar-save editor-save-fab" onClick={saveEdit}>
                保存 <kbd>⌘S</kbd>
              </button>
            </div>
          )
        ) : (
          <div className="empty">ノートを選択</div>
        )}
      </main>

      {creating && (
        <NewNoteDialog
          defaultPrefix={getParentFolder(currentPath)}
          onCreate={createNote}
          onCancel={() => setCreating(false)}
        />
      )}

      {renamingPath && (
        <RenameNoteDialog
          initialPath={renamingPath}
          onRename={(newPath) => renameNote(renamingPath, newPath)}
          onCancel={() => setRenamingPath(null)}
        />
      )}

      <TweaksPanel>
        <TweakSection label="探る軸" />
        <TweakRadio
          label="雰囲気"
          value={t.vibe}
          options={Object.entries(VIBE_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => setTweak('vibe', v)}
        />
        <TweakRadio
          label="サイドバー"
          value={t.sidebar}
          options={Object.entries(SIDEBAR_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => setTweak('sidebar', v)}
        />
        <TweakSection label="読みやすさ" />
        <TweakSlider
          label="本文の幅"
          value={t.measure}
          min={720}
          max={1400}
          step={20}
          unit="px"
          onChange={(v) => setTweak('measure', v)}
        />
        <TweakSlider
          label="文字サイズ"
          value={t.fontSize}
          min={15}
          max={20}
          step={1}
          unit="px"
          onChange={(v) => setTweak('fontSize', v)}
        />
        <TweakSection label="アクセント" />
        <TweakColor
          label="色"
          value={t.accent}
          options={['#6b6b6b', '#5b6b86', '#5b7a68', '#86705b']}
          onChange={(v) => setTweak('accent', v)}
        />
      </TweaksPanel>
    </div>
  );
}
