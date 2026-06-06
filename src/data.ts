export interface Note {
  path: string;
  created: string;
  updated: string;
  body: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  title?: string;
  children?: TreeNode[];
}

type FolderNode = TreeNode & { children: TreeNode[] };

export function ancestorsOf(path: string): string[] {
  const parts = path.split('/');
  const out: string[] = [];
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? acc + '/' + parts[i] : parts[i];
    out.push(acc);
  }
  return out;
}

export function noteTitle(note: Note): string {
  const m = note.body.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  const base = note.path.split('/').pop()!.replace(/\.md$/, '');
  return base;
}

export function buildTree(notes: Note[]): TreeNode {
  const root: FolderNode = { name: '~/notes', path: '', type: 'folder', children: [] };
  for (const note of notes) {
    const parts = note.path.split('/');
    let cur: FolderNode = root;
    let acc = '';
    parts.forEach((part, i) => {
      acc = acc ? acc + '/' + part : part;
      const isFile = i === parts.length - 1;
      let child = cur.children.find((c) => c.name === part);
      if (!child) {
        child = isFile
          ? { name: part, path: acc, type: 'file', title: noteTitle(note) }
          : { name: part, path: acc, type: 'folder', children: [] };
        cur.children.push(child);
      }
      if (!isFile) cur = child as FolderNode;
    });
  }
  const sortRec = (node: TreeNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}
