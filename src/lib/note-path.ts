export function getParentFolder(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? '' : path.slice(0, lastSlash + 1);
}

export interface ParsedNotePath {
  path: string;
  error: string;
}

export function parseNotePath(path: string): ParsedNotePath {
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
