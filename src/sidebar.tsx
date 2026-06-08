import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  ChevronRight,
  Plus,
  Download,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { TreeNode as TreeNodeData } from './data';

interface TreeNodeProps {
  node: TreeNodeData;
  expanded: Set<string>;
  currentPath: string;
  menuPath: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onOpenMenu: (rect: DOMRect, path: string) => void;
}

function TreeNode({
  node,
  expanded,
  currentPath,
  menuPath,
  onToggle,
  onOpen,
  onOpenMenu,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const open = expanded.has(node.path);
  const active = node.path === currentPath;
  const displayName = node.title ?? node.name.replace(/\.md$/, '');

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
                menuPath={menuPath}
                onToggle={onToggle}
                onOpen={onOpen}
                onOpenMenu={onOpenMenu}
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
    >
      <span className="sb-twirl sb-twirl-empty" aria-hidden="true" />
      <span className="sb-name">{displayName}</span>
      <button
        className="sb-action"
        type="button"
        aria-label={`${displayName} の操作`}
        aria-haspopup="menu"
        aria-expanded={menuPath === node.path}
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu(e.currentTarget.getBoundingClientRect(), node.path);
        }}
      >
        <MoreHorizontal width={14} height={14} aria-hidden="true" />
      </button>
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
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!ctxMenu) return;
    firstMenuItemRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtxMenu(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
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

  const handleOpenMenu = (rect: DOMRect, path: string) => {
    setCtxMenu({ x: rect.right - 4, y: rect.bottom + 4, path });
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
            menuPath={ctxMenu?.path ?? null}
            onToggle={onToggle}
            onOpen={onOpen}
            onOpenMenu={handleOpenMenu}
          />
        ))}
      </div>
      <div className="sb-foot">
        <div className="sb-foot-notes">
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
        <a
          className="sb-github"
          href="https://github.com/hirokisakabe/aze"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
        >
          <ExternalLink width={12} height={12} aria-hidden="true" />
          <span>GitHub</span>
        </a>
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="sb-ctx-menu"
          role="menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            ref={firstMenuItemRef}
            className="sb-ctx-item"
            type="button"
            role="menuitem"
            onClick={handleRename}
          >
            <Pencil width={13} height={13} aria-hidden="true" />
            パス変更
          </button>
          <button
            className="sb-ctx-item sb-ctx-delete"
            type="button"
            role="menuitem"
            onClick={handleDelete}
          >
            <Trash2 width={13} height={13} aria-hidden="true" />
            削除
          </button>
        </div>
      )}
    </aside>
  );
}
