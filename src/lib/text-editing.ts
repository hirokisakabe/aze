import { createElement, type ReactNode } from 'react';

export function renderWsOverlay(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let k = 0;
  const flush = () => {
    if (!buf) return;
    out.push(createElement('span', { key: k++, style: { color: 'transparent' } }, buf));
    buf = '';
  };
  for (const ch of text) {
    if (ch === ' ') {
      flush();
      out.push(createElement('span', { key: k++, className: 'ws-dot' }, ' '));
    } else if (ch === '\t') {
      flush();
      out.push(createElement('span', { key: k++, className: 'ws-tab' }, '\t'));
    } else {
      buf += ch;
    }
  }
  flush();
  return out;
}

const INDENT = '  ';

export interface IndentResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function lineBoundsForSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number
) {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const adjustedEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
      ? selectionEnd - 1
      : selectionEnd;
  const nextLineBreak = value.indexOf('\n', adjustedEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return { lineStart, lineEnd };
}

export function indentText(
  value: string,
  selectionStart: number,
  selectionEnd: number
): IndentResult {
  const { lineStart, lineEnd } = lineBoundsForSelection(value, selectionStart, selectionEnd);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const indented = lines.map((line) => `${INDENT}${line}`).join('\n');
  const inserted = lines.length * INDENT.length;
  return {
    value: value.slice(0, lineStart) + indented + value.slice(lineEnd),
    selectionStart: selectionStart + INDENT.length,
    selectionEnd:
      selectionStart === selectionEnd ? selectionEnd + INDENT.length : selectionEnd + inserted,
  };
}

export function unindentText(
  value: string,
  selectionStart: number,
  selectionEnd: number
): IndentResult {
  const { lineStart, lineEnd } = lineBoundsForSelection(value, selectionStart, selectionEnd);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  let cursor = lineStart;
  let selectionStartOffset = 0;
  let selectionEndOffset = 0;

  const unindented = lines
    .map((line) => {
      const removeCount = line.startsWith(INDENT) ? INDENT.length : line.startsWith(' ') ? 1 : 0;
      const removeStart = cursor;
      const removeEnd = cursor + removeCount;
      if (removeCount > 0) {
        if (removeEnd <= selectionStart) selectionStartOffset += removeCount;
        else if (removeStart < selectionStart) selectionStartOffset += selectionStart - removeStart;
        if (removeEnd <= selectionEnd) selectionEndOffset += removeCount;
        else if (removeStart < selectionEnd) selectionEndOffset += selectionEnd - removeStart;
      }
      cursor += line.length + 1;
      return line.slice(removeCount);
    })
    .join('\n');

  return {
    value: value.slice(0, lineStart) + unindented + value.slice(lineEnd),
    selectionStart: Math.max(lineStart, selectionStart - selectionStartOffset),
    selectionEnd: Math.max(lineStart, selectionEnd - selectionEndOffset),
  };
}
