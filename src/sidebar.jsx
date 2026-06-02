// sidebar.jsx — file tree for ~/notes/ with several "presentation" variants.
// variant: 'minimal' | 'guides' | 'markers' | 'compact'

function Chevron({ open }) {
  return (
    <svg
      className={"sb-chevron" + (open ? " is-open" : "")}
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

function TreeNode({ node, expanded, currentPath, onToggle, onOpen, variant }) {
  const isFolder = node.type === "folder";
  const open = expanded.has(node.path);
  const active = node.path === currentPath;
  const showChevron = variant !== "minimal";

  if (isFolder) {
    return (
      <div className="sb-group">
        <div
          className={"sb-row sb-folder" + (open ? " is-open" : "")}
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
            {node.children.map((c) => (
              <TreeNode
                key={c.path}
                node={c}
                expanded={expanded}
                currentPath={currentPath}
                onToggle={onToggle}
                onOpen={onOpen}
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
      className={"sb-row sb-file" + (active ? " is-active" : "")}
      onClick={() => onOpen(node.path)}
    >
      {variant === "markers" ? (
        <span className="sb-twirl sb-filemark" aria-hidden="true">
          ›
        </span>
      ) : (
        <span className="sb-twirl sb-twirl-empty" aria-hidden="true" />
      )}
      <span className="sb-name">{node.name.replace(/\.md$/, "")}</span>
    </div>
  );
}

export function Sidebar({ tree, expanded, currentPath, onToggle, onOpen, onNew, variant, count }) {
  return (
    <aside className={"sidebar sb-variant-" + variant}>
      <div className="sb-brand">
        <span className="brand-mark" aria-hidden="true"></span>
        <span className="brand-name">aze</span>
        <button
          className="sb-new"
          title="新規ノート（N）"
          onClick={onNew}
          aria-label="新規ノート"
        >
          +
        </button>
      </div>
      <div className="sb-rootlabel">~/notes</div>
      <div className="sb-tree">
        {tree.children.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            expanded={expanded}
            currentPath={currentPath}
            onToggle={onToggle}
            onOpen={onOpen}
            variant={variant}
          />
        ))}
      </div>
      <div className="sb-foot">{count} notes</div>
    </aside>
  );
}
