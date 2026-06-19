import JSZip from 'jszip';
import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';

import {
  assetMarkdownUrl,
  createAssetId,
  extractAssetIdsFromMarkdown,
  exportedAssetPath,
  readableAltText,
  referencedImageAssets,
  rewriteAssetUrlsForExport,
} from './assets';
import { buildTree, ancestorsOf, type Note } from './data';
import { MarkdownPreview } from './markdown';
import { notesRepository, type Unsubscribe } from './notes-repository';
import { Sidebar } from './sidebar';

const TODAY = new Intl.DateTimeFormat('sv-SE').format(new Date());

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
          {' '}
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

function useRepositorySubscription<T>(
  subscribe: (listener: (value: T) => void) => Unsubscribe
): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => subscribe(setValue), [subscribe]);
  return value;
}

async function persistNoteBody(note: Note, body: string) {
  await notesRepository.saveNote(
    { ...note, body, updated: TODAY },
    extractAssetIdsFromMarkdown(body)
  );
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

export default function App() {
  // subscribe* は安定した参照を保つため unbound のメソッド参照として渡す
  // (this を参照する driver は constructor で bind 済み。fs-notes-repository.ts のコメント参照)。
  /* eslint-disable @typescript-eslint/unbound-method */
  const rawNotes = useRepositorySubscription(notesRepository.subscribeNotes);
  const rawImageAssets = useRepositorySubscription(notesRepository.subscribeImageAssets);
  /* eslint-enable @typescript-eslint/unbound-method */
  const notes = useMemo(() => rawNotes ?? [], [rawNotes]);
  const imageAssets = useMemo(() => rawImageAssets ?? [], [rawImageAssets]);
  const [currentPath, setCurrentPath] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState('');
  const [assetError, setAssetError] = useState('');
  const [isDroppingImage, setIsDroppingImage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionRef = useRef<Pick<IndentResult, 'selectionStart' | 'selectionEnd'> | null>(
    null
  );
  const pathInitializedRef = useRef(false);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const current = useMemo(() => notes.find((n) => n.path === currentPath), [notes, currentPath]);
  const assetUrls = useMemo(() => {
    const next = new Map<string, string>();
    for (const asset of imageAssets) {
      next.set(asset.id, URL.createObjectURL(asset.blob));
    }
    return next;
  }, [imageAssets]);
  const resolveAssetUrl = useCallback((id: string) => assetUrls.get(id), [assetUrls]);

  useEffect(() => {
    return () => {
      for (const url of assetUrls.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [assetUrls]);

  const openNote = useCallback(
    async (path: string) => {
      if (mode === 'edit' && current && path !== currentPath && draft !== current.body) {
        try {
          await persistNoteBody(current, draft);
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
    void notesRepository.getLastOpenedPath().then((saved) => {
      const path = saved && notes.some((n) => n.path === saved) ? saved : notes[0].path;
      setCurrentPath(path);
      setExpanded(new Set(ancestorsOf(path)));
    });
  }, [notes]);

  useEffect(() => {
    if (!currentPath) return;
    void notesRepository.setLastOpenedPath(currentPath);
  }, [currentPath]);

  const enterEdit = useCallback(() => {
    if (!current) return;
    setDraft(current.body);
    setMode('edit');
  }, [current]);

  const saveEdit = useCallback(async () => {
    if (!current) return;
    await persistNoteBody(current, draft);
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

  const insertMarkdownAtCursor = useCallback((markdown: string) => {
    const textarea = taRef.current;
    setDraft((currentDraft) => {
      const selectionStart = textarea?.selectionStart ?? currentDraft.length;
      const selectionEnd = textarea?.selectionEnd ?? selectionStart;
      const prefix = currentDraft.slice(0, selectionStart);
      const suffix = currentDraft.slice(selectionEnd);
      const needsLeadingBreak = prefix.length > 0 && !prefix.endsWith('\n') ? '\n' : '';
      const needsTrailingBreak = suffix.length > 0 && !markdown.endsWith('\n') ? '\n' : '';
      const insertion = `${needsLeadingBreak}${markdown}${needsTrailingBreak}`;
      const cursor = prefix.length + insertion.length;
      pendingSelectionRef.current = { selectionStart: cursor, selectionEnd: cursor };
      return `${prefix}${insertion}${suffix}`;
    });
  }, []);

  const uploadImageFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!current) return;

      const allFiles = Array.from(files);
      const imageFiles = allFiles.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        if (allFiles.length > 0) {
          setAssetError('画像ファイルのみ追加できます。');
        }
        return;
      }

      setAssetError('');
      try {
        const created = new Intl.DateTimeFormat('sv-SE').format(new Date());
        const assets = imageFiles.map((file) => {
          const id = createAssetId();
          return {
            id,
            notePath: current.path,
            filename: file.name || 'image',
            mimeType: file.type,
            blob: file,
            created,
            markdown: `![${readableAltText(file.name)}](${assetMarkdownUrl(id)})`,
          };
        });
        await notesRepository.addImageAssets(
          assets.map(({ markdown, ...asset }) => {
            void markdown;
            return asset;
          })
        );
        const markdownLines = assets.map((asset) => asset.markdown);
        insertMarkdownAtCursor(markdownLines.join('\n'));
      } catch {
        setAssetError('画像を保存できませんでした。本文は変更していません。');
      }
    },
    [current, insertMarkdownAtCursor]
  );

  const cancelEdit = useCallback(async () => {
    if (current) {
      await notesRepository.pruneImageAssets(
        current.path,
        extractAssetIdsFromMarkdown(current.body)
      );
    }
    setAssetError('');
    setMode('view');
  }, [current]);

  const createNote = useCallback(
    async (path: string) => {
      setCreating(false);
      const exists = await notesRepository.getNote(path);
      if (exists) {
        void openNote(path);
        return;
      }
      const base = path.split('/').pop()!.replace(/\.md$/, '');
      const body = `# ${base}\n\n`;
      await notesRepository.createNote({ path, created: TODAY, updated: TODAY, body });
      setCurrentPath(path);
      setExpanded(new Set(ancestorsOf(path)));
      setDraft(body);
      setMode('edit');
    },
    [openNote]
  );

  const deleteNote = useCallback(
    async (path: string) => {
      await notesRepository.deleteNote(path);
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
      const exists = await notesRepository.getNote(newPath);
      if (exists) return `「${newPath}」は既に存在します。`;

      await notesRepository.renameNote(note, newPath, oldPath === currentPath);

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
    const all = await notesRepository.getAllNotes();
    const allAssets = await notesRepository.getAllImageAssets();
    const referencedAssets = referencedImageAssets(
      all.map((note) => note.body),
      allAssets
    );
    for (const note of all) {
      zip.file(note.path, rewriteAssetUrlsForExport(note.body, referencedAssets));
    }
    for (const asset of referencedAssets) {
      zip.file(exportedAssetPath(asset), asset.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aze-notes-export-${today}.zip`;
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
          void saveEdit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          void cancelEdit();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, creating, enterEdit, saveEdit, cancelEdit]);

  return (
    <div className="app">
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
                  {current && (
                    <MarkdownPreview content={current.body} resolveAssetUrl={resolveAssetUrl} />
                  )}
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
                  {isDroppingImage && <div className="editor-drop-hint">画像を追加</div>}
                  <div ref={overlayRef} className="editor-ws-overlay" aria-hidden="true">
                    {renderWsOverlay(draft)}
                  </div>
                  <textarea
                    ref={taRef}
                    className="editor-area"
                    value={draft}
                    spellCheck={false}
                    onChange={(e) => setDraft(e.target.value)}
                    onPaste={(e) => {
                      const files = e.clipboardData.files;
                      if (Array.from(files).some((file) => file.type.startsWith('image/'))) {
                        e.preventDefault();
                        void uploadImageFiles(files);
                      }
                    }}
                    onDragEnter={(e) => {
                      if (
                        Array.from(e.dataTransfer.items).some((item) =>
                          item.type.startsWith('image/')
                        )
                      ) {
                        setIsDroppingImage(true);
                      }
                    }}
                    onDragOver={(e) => {
                      if (
                        Array.from(e.dataTransfer.items).some((item) =>
                          item.type.startsWith('image/')
                        )
                      ) {
                        e.preventDefault();
                        setIsDroppingImage(true);
                      }
                    }}
                    onDragLeave={() => setIsDroppingImage(false)}
                    onDrop={(e) => {
                      setIsDroppingImage(false);
                      if (e.dataTransfer.files.length === 0) return;
                      e.preventDefault();
                      void uploadImageFiles(e.dataTransfer.files);
                    }}
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
                <input
                  ref={imageInputRef}
                  className="image-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) void uploadImageFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  className="bar-tool"
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                >
                  画像
                </button>
                {assetError && (
                  <span className="bar-error" role="alert">
                    {assetError}
                  </span>
                )}
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
    </div>
  );
}
