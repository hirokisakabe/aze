// app.jsx — minimal Markdown notes on top of ~/notes/
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const TODAY = "2024-06-02";

const TWEAK_DEFAULTS = {
  vibe: "editor",
  sidebar: "compact",
  measure: 1200,
  fontSize: 17,
  accent: "#5b6b86",
};

const VIBE_LABELS = { quiet: "静かな紙", editor: "エディタ", editorial: "雑誌" };
const SIDEBAR_LABELS = { minimal: "ミニマル", guides: "ガイド線", markers: "マーカー", compact: "コンパクト" };

function ancestorsOf(path) {
  const parts = path.split("/");
  const out = [];
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? acc + "/" + parts[i] : parts[i];
    out.push(acc);
  }
  return out;
}

function Breadcrumb({ path }) {
  const parts = path.replace(/\.md$/, "").split("/");
  return (
    <div className="crumb">
      <span className="crumb-bracket">[</span>
      {parts.map((p, i) => (
        <span className="crumb-seg" key={i}>
          {i > 0 && <span className="crumb-sep">/</span>}
          <span className={i === parts.length - 1 ? "crumb-leaf" : ""}>{p}</span>
        </span>
      ))}
      <span className="crumb-bracket">]</span>
    </div>
  );
}

function NewNoteDialog({ onCreate, onCancel }) {
  const [val, setVal] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    ref.current && ref.current.focus();
  }, []);
  const submit = () => {
    let p = val.trim();
    if (!p) return;
    if (!p.endsWith(".md")) p += ".md";
    onCreate(p);
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
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
        <div className="dialog-hint">
          パスを入力 → <kbd>Enter</kbd> で作成。フォルダは自動で作られます。
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [notes, setNotes] = useState(() => NOTES.map((n) => ({ ...n })));
  const [currentPath, setCurrentPath] = useState("daily/2024-06-02.md");
  const [mode, setMode] = useState("view");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set(ancestorsOf("daily/2024-06-02.md")));
  const taRef = useRef(null);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const current = useMemo(() => notes.find((n) => n.path === currentPath), [notes, currentPath]);

  const openNote = useCallback((path) => {
    setCurrentPath(path);
    setMode("view");
    setExpanded(new Set(ancestorsOf(path)));
  }, []);

  const toggleFolder = useCallback((path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const enterEdit = useCallback(() => {
    if (!current) return;
    setDraft(current.body);
    setMode("edit");
  }, [current]);

  const saveEdit = useCallback(() => {
    setNotes((prev) =>
      prev.map((n) => (n.path === currentPath ? { ...n, body: draft, updated: TODAY } : n))
    );
    setMode("view");
  }, [draft, currentPath]);

  const cancelEdit = useCallback(() => setMode("view"), []);

  const createNote = useCallback(
    (path) => {
      setCreating(false);
      const exists = notes.find((n) => n.path === path);
      if (exists) {
        openNote(path);
        return;
      }
      const base = path.split("/").pop().replace(/\.md$/, "");
      const body = `# ${base}\n\n`;
      setNotes((prev) => [...prev, { path, created: TODAY, updated: TODAY, body }]);
      setCurrentPath(path);
      setExpanded(new Set(ancestorsOf(path)));
      setDraft(body);
      setMode("edit");
    },
    [notes, openNote]
  );

  useEffect(() => {
    if (mode === "edit" && taRef.current) {
      const ta = taRef.current;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (e) => {
      const typing =
        e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
      if (mode === "view" && !creating) {
        if ((e.key === "e" || e.key === "E") && !typing && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          enterEdit();
        }
        if (e.key === "n" && !typing && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setCreating(true);
        }
      } else if (mode === "edit") {
        if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter")) {
          e.preventDefault();
          saveEdit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, creating, enterEdit, saveEdit, cancelEdit]);

  const rendered = useMemo(() => (current ? renderMarkdown(current.body) : null), [current]);

  return (
    <div
      className={"app vibe-" + t.vibe}
      style={{
        "--measure": t.measure + "px",
        "--body-size": t.fontSize + "px",
        "--accent": t.accent,
      }}
    >
      <Sidebar
        tree={tree}
        expanded={expanded}
        currentPath={currentPath}
        onToggle={toggleFolder}
        onOpen={openNote}
        onNew={() => setCreating(true)}
        variant={t.sidebar}
        count={notes.length}
      />

      <main className="main">
        {current ? (
          mode === "view" ? (
            <div className="reader" key={currentPath}>
              <div className="reader-inner">
                <Breadcrumb path={current.path} />
                <article className="doc">{rendered}</article>
                <footer className="meta">
                  <div className="meta-rule" />
                  <div className="meta-dates">
                    <span>作成 {current.created}</span>
                    <span className="meta-dot">·</span>
                    <span>更新 {current.updated}</span>
                  </div>
                </footer>
              </div>
              <button className="edit-fab" onClick={enterEdit} title="編集 (E)">
                <span className="fab-key">E</span> 編集
              </button>
            </div>
          ) : (
            <div className="editor">
              <div className="editor-inner">
                <Breadcrumb path={current.path} />
                <textarea
                  ref={taRef}
                  className="editor-area"
                  value={draft}
                  spellCheck={false}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>
              <div className="editor-bar">
                <span className="bar-mode">編集中</span>
                <span className="bar-spacer" />
                <span className="bar-hint">
                  <kbd>esc</kbd> 取消
                </span>
                <button className="bar-save" onClick={saveEdit}>
                  保存 <kbd>⌘S</kbd>
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="empty">ノートを選択</div>
        )}
      </main>

      {creating && <NewNoteDialog onCreate={createNote} onCancel={() => setCreating(false)} />}

      <TweaksPanel>
        <TweakSection label="探る軸" />
        <TweakRadio
          label="雰囲気"
          value={t.vibe}
          options={Object.entries(VIBE_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => setTweak("vibe", v)}
        />
        <TweakRadio
          label="サイドバー"
          value={t.sidebar}
          options={Object.entries(SIDEBAR_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => setTweak("sidebar", v)}
        />
        <TweakSection label="読みやすさ" />
        <TweakSlider
          label="本文の幅"
          value={t.measure}
          min={720}
          max={1400}
          step={20}
          unit="px"
          onChange={(v) => setTweak("measure", v)}
        />
        <TweakSlider
          label="文字サイズ"
          value={t.fontSize}
          min={15}
          max={20}
          step={1}
          unit="px"
          onChange={(v) => setTweak("fontSize", v)}
        />
        <TweakSection label="アクセント" />
        <TweakColor
          label="色"
          value={t.accent}
          options={["#6b6b6b", "#5b6b86", "#5b7a68", "#86705b"]}
          onChange={(v) => setTweak("accent", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
