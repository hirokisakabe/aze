// Detect and parse a leading YAML frontmatter block.
//
// aze does not interpret specific keys: every entry is treated as an opaque
// key/value pair. Only scalar and (block or flow) sequence values are parsed;
// anything else is kept as its raw string so rendering stays generic.
//
// The original content is never re-serialized. `raw` holds the verbatim
// frontmatter block (delimiters included) and `body` the remainder, so
// `(raw ?? '') + body === content` always holds — frontmatter round-trips
// losslessly through save.

type FrontmatterValue = string | string[];

export interface FrontmatterEntry {
  key: string;
  value: FrontmatterValue;
}

export interface ParsedFrontmatter {
  /** Verbatim frontmatter block including the `---` delimiters, or null when absent. */
  raw: string | null;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** Parsed key/value entries in source order (empty when there is no frontmatter). */
  entries: FrontmatterEntry[];
}

// A frontmatter block opens with `---` on the very first line and closes with a
// line that is exactly `---`. Trailing spaces/tabs on the fences are tolerated.
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseFlowSequence(value: string): string[] {
  const inner = value.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map(stripQuotes);
}

function parseInner(inner: string): FrontmatterEntry[] {
  const lines = inner.split(/\r?\n/);
  const entries: FrontmatterEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const content = line.trim();
    // Skip blank lines, comments, and indented lines that are not a key.
    if (content === '' || content.startsWith('#') || /^\s/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (key === '') continue;
    const rest = line.slice(colon + 1).trim();
    if (rest === '') {
      // A bare key may be followed by an indented block sequence.
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(stripQuotes(lines[i].replace(/^\s*-\s+/, '')));
        i += 1;
      }
      entries.push({ key, value: items.length > 0 ? items : '' });
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      entries.push({ key, value: parseFlowSequence(rest) });
    } else {
      entries.push({ key, value: stripQuotes(rest) });
    }
  }
  return entries;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { raw: null, body: content, entries: [] };
  const entries = parseInner(match[1]);
  // Only treat the block as frontmatter when it yields at least one key/value
  // pair; otherwise leave the content untouched so nothing is silently dropped.
  if (entries.length === 0) return { raw: null, body: content, entries: [] };
  return { raw: match[0], body: content.slice(match[0].length), entries };
}
