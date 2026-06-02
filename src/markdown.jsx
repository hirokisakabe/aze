// markdown.jsx — a small, dependency-free Markdown → React renderer.
// Supports: # headings, paragraphs, > blockquotes, --- rules, fenced ```code```,
// - / 1. lists, - [ ] / - [x] task checkboxes, and inline **bold** *italic*
// `code` ~~strike~~ [link](url).

import { createElement as h } from "react";

function parseInline(text, keyPrefix) {
  const out = [];
  let rest = text;
  let k = 0;
  const push = (node) => out.push(node);
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(\[[^\]]+\]\([^)]+\))/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) {
      push(rest);
      break;
    }
    if (m.index > 0) push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${k++}`;
    if (tok.startsWith("`")) {
      push(h("code", { key, className: "md-code" }, tok.slice(1, -1)));
    } else if (tok.startsWith("**")) {
      push(h("strong", { key }, parseInline(tok.slice(2, -2), key)));
    } else if (tok.startsWith("~~")) {
      push(h("del", { key }, parseInline(tok.slice(2, -2), key)));
    } else if (tok.startsWith("*")) {
      push(h("em", { key }, parseInline(tok.slice(1, -1), key)));
    } else if (tok.startsWith("[")) {
      const lm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      push(
        h(
          "a",
          { key, href: lm[2], className: "md-link", onClick: (e) => e.preventDefault() },
          lm[1]
        )
      );
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;
  const nextKey = () => `b${key++}`;

  while (i < lines.length) {
    let line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        h("pre", { key: nextKey(), className: "md-pre" }, h("code", null, buf.join("\n")))
      );
      continue;
    }

    const hm = line.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      const lvl = hm[1].length;
      const tag = "h" + lvl;
      blocks.push(
        h(tag, { key: nextKey(), className: "md-h md-h" + lvl }, parseInline(hm[2], nextKey()))
      );
      i++;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(h("hr", { key: nextKey(), className: "md-hr" }));
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        h(
          "blockquote",
          { key: nextKey(), className: "md-quote" },
          buf.map((b, idx) => h("div", { key: idx }, parseInline(b, nextKey())))
        )
      );
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        const task = raw.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
          const done = task[1].toLowerCase() === "x";
          items.push(
            h(
              "li",
              { key: items.length, className: "md-li md-task" + (done ? " is-done" : "") },
              h("span", { className: "md-check", "aria-hidden": "true" }, done ? "✓" : ""),
              h("span", { className: "md-task-text" }, parseInline(task[2], nextKey()))
            )
          );
        } else {
          items.push(
            h("li", { key: items.length, className: "md-li" }, parseInline(raw, nextKey()))
          );
        }
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      const hasTask = items.some((it) => it.props.className.includes("md-task"));
      blocks.push(
        h(tag, { key: nextKey(), className: "md-list" + (hasTask ? " md-tasklist" : "") }, items)
      );
      continue;
    }

    const buf = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,4}\s|>|\s*---+\s*$|```|\s*([-*]|\d+\.)\s+)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      h(
        "p",
        { key: nextKey(), className: "md-p" },
        buf.flatMap((b, idx) =>
          idx === 0 ? parseInline(b, nextKey()) : [h("br", { key: "br" + idx }), ...parseInline(b, nextKey())]
        )
      )
    );
  }

  return blocks;
}
