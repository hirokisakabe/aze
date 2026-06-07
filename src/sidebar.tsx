import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronRight, Plus, Download, Pencil } from 'lucide-react';
import type { TreeNode as TreeNodeData } from './data';

interface TreeNodeProps {
  node: TreeNodeData;
  expanded: Set<string>;
  currentPath: string;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}

function TreeNode({ node, expanded, currentPath, onToggle, onOpen, onContextMenu }: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const open = expanded.has(node.path);
  const active = node.path === currentPath;

  if (isFolder) {
    return (
      <div className="sb-group">
        <div
          className={'sb-row sb-folder' + (open ? ' is-open' : '')}
          onClick={() => onToggle(node.path)}
        >
          <span className="sb-twirl">
            <ChevronRight
              className={'sb-chevron' + (open ? ' is-open' : '')}
              width={9}
              height={9}
              aria-hidden="true"
            />
          </span>
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
      <span className="sb-twirl sb-twirl-empty" aria-hidden="true" />
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
  onRename: (path: string) => void;
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
  onRename,
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

  const handleRename = () => {
    if (!ctxMenu) return;
    const { path } = ctxMenu;
    setCtxMenu(null);
    onRename(path);
  };

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="brand-mark" aria-hidden="true"></span>
        <span className="brand-name">aze</span>
        <button className="sb-new" title="新規ノート（N）" onClick={onNew} aria-label="新規ノート">
          <Plus width={14} height={14} aria-hidden="true" />
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
          <Download width={14} height={14} aria-hidden="true" />
        </button>
      </div>

      {ctxMenu && (
        <div ref={ctxRef} className="sb-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className="sb-ctx-item" onClick={handleRename}>
            <Pencil width={13} height={13} aria-hidden="true" />
            パス変更
          </button>
          <button className="sb-ctx-item sb-ctx-delete" onClick={handleDelete}>
            削除
          </button>
        </div>
      )}
    </aside>
  );
}
