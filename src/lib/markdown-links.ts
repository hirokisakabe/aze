const protocolPattern = /^[a-z][a-z0-9+.-]*:/i;

export type MarkdownNoteLinkResolution =
  | { status: 'resolved'; path: string }
  | { status: 'missing'; path: string };

export function resolveRelativeMarkdownNotePath(currentPath: string, href: string) {
  const rawHref = href.trim();
  if (!rawHref || rawHref.startsWith('/') || rawHref.startsWith('//')) return null;
  if (protocolPattern.test(rawHref)) return null;

  const targetWithoutAnchor = rawHref.split(/[?#]/, 1)[0];
  if (!targetWithoutAnchor.endsWith('.md')) return null;

  const segments = currentPath.split('/');
  segments.pop();

  for (const part of targetWithoutAnchor.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return segments.length > 0 ? segments.join('/') : null;
}

export function resolveMarkdownNoteLink(
  currentPath: string,
  href: string,
  existingPaths: ReadonlySet<string>
): MarkdownNoteLinkResolution | null {
  const path = resolveRelativeMarkdownNotePath(currentPath, href);
  if (!path) return null;
  return existingPaths.has(path) ? { status: 'resolved', path } : { status: 'missing', path };
}
