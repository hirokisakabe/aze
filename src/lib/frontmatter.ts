// Detect and parse a leading YAML frontmatter block.
//
// aze does not interpret specific keys: every entry is treated as an opaque
// key/value pair. Scalar and sequence (block or flow) values are parsed into a
// string / string[]; any other YAML construct (nested mapping, block scalar,
// etc.) is preserved as its raw, dedented text so the content stays visible
// rather than being silently dropped together with the stripped block.
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
// line that is exactly `---`. The closing fence must start on its own line
// (mandatory `\r?\n` before it) so a `---` appearing inside a value is not
// mistaken for the closing delimiter. Trailing spaces/tabs on the fences are
// tolerated.
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
// Block scalar indicator after a key, e.g. `|`, `>`, `|-`, `>2`.
const BLOCK_SCALAR_RE = /^[|>][+-]?\d*$/;
const SEQUENCE_ITEM_RE = /^\s*-\s+/;

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

// Split a flow sequence body (the text inside `[ ]`) on top-level commas while
// respecting quoted strings, so `"x,y", z` yields `['x,y', 'z']`.
function splitFlowItems(inner: string): string[] {
  if (inner.trim() === '') return [];
  const items: string[] = [];
  let quote: string | null = null;
  let cur = '';
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items.map(stripQuotes);
}

// Strip the common leading indentation from a block of lines and join them,
// preserving relative structure for opaque rendering.
function dedent(block: string[]): string {
  const indents = block
    .filter((line) => line.trim() !== '')
    .map((line) => /^\s*/.exec(line)![0].length);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return block.map((line) => line.slice(min)).join('\n');
}

function parseInner(inner: string): FrontmatterEntry[] {
  const lines = inner.split(/\r?\n/);
  const entries: FrontmatterEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const content = line.trim();
    // Skip blank lines, comments, and indented lines (the latter are consumed
    // as part of a preceding key's block; any stray one is ignored).
    if (content === '' || content.startsWith('#') || /^\s/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (key === '') continue;
    const rest = line.slice(colon + 1).trim();

    if (rest !== '' && !BLOCK_SCALAR_RE.test(rest)) {
      // Inline scalar or flow sequence.
      if (rest.startsWith('[') && rest.endsWith(']')) {
        entries.push({ key, value: splitFlowItems(rest.slice(1, -1)) });
      } else {
        entries.push({ key, value: stripQuotes(rest) });
      }
      continue;
    }

    // Bare key or block-scalar indicator: gather the following indented block.
    const blockScalar = BLOCK_SCALAR_RE.test(rest);
    const block: string[] = [];
    while (i < lines.length && /^\s+\S/.test(lines[i])) {
      block.push(lines[i]);
      i += 1;
    }
    if (!blockScalar && block.length > 0 && block.every((l) => SEQUENCE_ITEM_RE.test(l))) {
      entries.push({ key, value: block.map((l) => stripQuotes(l.replace(SEQUENCE_ITEM_RE, ''))) });
    } else if (block.length > 0) {
      // Nested mapping / block scalar / mixed content: keep the raw (dedented)
      // text so nothing is silently dropped from the view.
      entries.push({ key, value: dedent(block) });
    } else {
      entries.push({ key, value: '' });
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
