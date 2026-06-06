import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import type { TreeNode as TreeNodeData } from './data';

interface ChevronProps {
  open: boolean;
}

function Chevron({ open }: ChevronProps) {
  return (
    <svg
      className={'sb-chevron' + (open ? ' is-open' : '')}
      width="9"
      height="9"
      viewBox="0 0 10 10"
      aria-hidden="true"
    >
      <path
        d="M3 1.5 L7 5 L3 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface TreeNodeProps {
  node: TreeNodeData;
  expanded: Set<string>;
  currentPath: string;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  variant: string;
}

function TreeNode({
  node,
  expanded,
  currentPath,
  onToggle,
  onOpen,
  onContextMenu,
  variant,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const open = expanded.has(node.path);
  const active = node.path === currentPath;
  const showChevron = variant !== 'minimal';

  if (isFolder) {
    return (
      <div className="sb-group">
        <div
          className={'sb-row sb-folder' + (open ? ' is-open' : '')}
          onClick={() => onToggle(node.path)}
        >
          {showChevron ? (
            <span className="sb-twirl">
              <Chevron open={open} />
            </span>
          ) : (
            <span className="sb-twirl sb-twirl-empty" aria-hidden="true" />
          )}
          <span className="sb-name">{node.name}</span>
        </div>
        {open && (
          <div className="sb-children">
            {(node.children ?? []).map((c) => (
              <TreeNode
                key={c.path}
                node={c}
                expanded={expanded}
                currentPath={currentPath}
                onToggle={onToggle}
                onOpen={onOpen}
                onContextMenu={onContextMenu}
                variant={variant}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={'sb-row sb-file' + (active ? ' is-active' : '')}
      onClick={() => onOpen(node.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node.path);
      }}
    >
      {variant === 'markers' ? (
        <span className="sb-twirl sb-filemark" aria-hidden="true">
          ›
        </span>
      ) : (
        <span className="sb-twirl sb-twirl-empty" aria-hidden="true" />
      )}
      <span className="sb-name">{node.title ?? node.name.replace(/\.md$/, '')}</span>
    </div>
  );
}

interface SidebarProps {
  tree: TreeNodeData;
  expanded: Set<string>;
  currentPath: string;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onNew: () => void;
  onExport: () => void;
  onDelete: (path: string) => void;
  variant: string;
  count: number;
}

export function Sidebar({
  tree,
  expanded,
  currentPath,
  onToggle,
  onOpen,
  onNew,
  onExport,
  onDelete,
  variant,
  count,
}: SidebarProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  useLayoutEffect(() => {
    if (!ctxMenu || !ctxRef.current) return;
    const rect = ctxRef.current.getBoundingClientRect();
    const clampedX = Math.min(ctxMenu.x, window.innerWidth - rect.width - 4);
    const clampedY = Math.min(ctxMenu.y, window.innerHeight - rect.height - 4);
    if (clampedX !== ctxMenu.x || clampedY !== ctxMenu.y) {
      setCtxMenu({ ...ctxMenu, x: clampedX, y: clampedY });
    }
  }, [ctxMenu]);

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, path });
  };

  const handleDelete = () => {
    if (!ctxMenu) return;
    const { path } = ctxMenu;
    setCtxMenu(null);
    if (window.confirm(`「${path}」を削除しますか？`)) {
      onDelete(path);
    }
  };

  return (
    <aside className={'sidebar sb-variant-' + variant}>
      <div className="sb-brand">
        <span className="brand-mark" aria-hidden="true"></span>
        <span className="brand-name">aze</span>
        <button className="sb-new" title="新規ノート（N）" onClick={onNew} aria-label="新規ノート">
          +
        </button>
      </div>
      <div className="sb-rootlabel">~/notes</div>
      <div className="sb-tree">
        {(tree.children ?? []).map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            expanded={expanded}
            currentPath={currentPath}
            onToggle={onToggle}
            onOpen={onOpen}
            onContextMenu={handleContextMenu}
            variant={variant}
          />
        ))}
      </div>
      <div className="sb-foot">
        <span>{count} notes</span>
        <button
          className="sb-export"
          title="エクスポート"
          onClick={onExport}
          aria-label="エクスポート"
        >
          ↓
        </button>
      </div>

      {ctxMenu && (
        <div ref={ctxRef} className="sb-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className="sb-ctx-item sb-ctx-delete" onClick={handleDelete}>
            削除
          </button>
        </div>
      )}
    </aside>
  );
}
