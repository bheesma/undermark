import { DiagnosticsList } from './diagnostics.ts';
import { canonicalise, MAX_LIST_DEPTH, normalizeRuns } from './documentModel.ts';
import type { Block, DocumentModel, ListBlock, ListItem } from './documentModel.ts';
import { isEscapable, parseInline } from './inline.ts';

export interface ParseResult {
  model: DocumentModel;
  diagnostics: DiagnosticsList;
}

const FENCE = /^ {0,3}(`{3,})([^`]*)$/;
const SEPARATOR = /^ {0,3}\*{3,}\s*$/;
const SUBHEADING = /^# +(\S.*)$/;
const LIST_ITEM = /^( *)(-|\d+[.)])(?: +(.*))?$/;
const TITLE_RULE = /^ {0,3}={3,}\s*$/;
const HEADING_RULE = /^ {0,3}-{3,}\s*$/;

const isBlank = (line: string) => line.trim() === '';
const expandTabs = (line: string) => line.replace(/^\t+/, (t) => '    '.repeat(t.length));

function listMatch(line: string): RegExpExecArray | null {
  return LIST_ITEM.exec(expandTabs(line).trimEnd());
}

/** Reads "![alt](src)" filling the whole line, or returns null. */
function parseImageLine(line: string): { alt: string; src: string } | null {
  if (!line.startsWith('![')) return null;
  let i = 2;
  let alt = '';
  for (; i < line.length && line[i] !== ']'; i++) {
    if (line[i] === '\\' && isEscapable(line[i + 1])) i++;
    alt += line[i];
  }
  if (line[i] !== ']' || line[i + 1] !== '(') return null;
  i += 2;
  let src = '';
  for (; i < line.length && line[i] !== ')'; i++) {
    if (line[i] === '\\' && isEscapable(line[i + 1])) i++;
    src += line[i];
  }
  return line[i] === ')' && i === line.length - 1 ? { alt, src } : null;
}

function startsBlock(line: string): boolean {
  const t = line.trim();
  return FENCE.test(line) || SEPARATOR.test(line) || SUBHEADING.test(t) || parseImageLine(t) !== null || listMatch(line) !== null;
}

function unsupportedReason(text: string): string | null {
  if (text.startsWith('>')) return 'block quotes are not supported; kept as text';
  if (text.startsWith('|')) return 'tables are not supported; kept as text';
  if (/^<\/?[A-Za-z][^>]*>/.test(text)) return 'HTML is not supported; kept as text';
  if (/^#{2,6}\s/.test(text)) return 'only one heading level (#) is supported; kept as text';
  return null;
}

/**
 * Reads file text into a model. Never fails: anything it cannot honour stays as visible
 * plain text and is reported as a diagnostic. Does not change the text it is given.
 */
export function parse(text: string): ParseResult {
  const diagnostics = new DiagnosticsList();
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const blocks: Block[] = [];

  const inline = (raw: string, lineNo: number) => {
    const { runs, problems } = parseInline(raw);
    for (const p of problems) diagnostics.add(lineNo, p);
    return runs;
  };

  // headings hold plain text: any formatting in the source is dropped, with a note
  const plain = (raw: string, lineNo: number) => {
    const runs = inline(raw, lineNo);
    if (runs.some((r) => r.marks.length > 0)) diagnostics.add(lineNo, 'formatting inside a heading is not supported; kept the text only');
    return normalizeRuns(runs.map((r) => ({ text: r.text, marks: [] })));
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const lineNo = i + 1;
    if (isBlank(line)) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const size = fence[1]!.length;
      const language = fence[2]!.trim().split(/\s+/)[0] || null;
      const closing = new RegExp('^ {0,3}`{' + size + ',}\\s*$');
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !closing.test(lines[j]!)) body.push(lines[j++]!);
      if (j >= lines.length) {
        diagnostics.add(lineNo, 'code block is never closed; it runs to the end of the file');
        while (body.length > 0 && body[body.length - 1] === '') body.pop(); // the file's final newline
      }
      blocks.push({ kind: 'codeBlock', language, text: body.join('\n') });
      i = j + 1;
      continue;
    }

    if (SEPARATOR.test(line)) { blocks.push({ kind: 'separator' }); i++; continue; }

    const trimmed = line.trim();
    const sub = SUBHEADING.exec(trimmed);
    if (sub) { blocks.push({ kind: 'subheading', content: plain(sub[1]!, lineNo) }); i++; continue; }

    const image = parseImageLine(trimmed);
    if (image) { blocks.push({ kind: 'image', ...image }); i++; continue; }

    if (listMatch(line)) {
      const { list, next } = readList(lines, i, diagnostics, inline);
      blocks.push(list);
      i = next;
      continue;
    }

    const rule = lines[i + 1];
    if (rule !== undefined && TITLE_RULE.test(rule)) { blocks.push({ kind: 'title', content: plain(trimmed, lineNo) }); i += 2; continue; }
    if (rule !== undefined && HEADING_RULE.test(rule)) { blocks.push({ kind: 'heading', content: plain(trimmed, lineNo) }); i += 2; continue; }

    const reason = unsupportedReason(trimmed);
    if (reason) {
      diagnostics.add(lineNo, reason);
      blocks.push({ kind: 'paragraph', content: inline(trimmed, lineNo) });
      i++;
      continue;
    }

    // Consecutive plain lines join into one paragraph, separated by a space.
    const parts = [trimmed];
    let j = i + 1;
    while (j < lines.length && !isBlank(lines[j]!) && !startsBlock(lines[j]!)) {
      const after = lines[j + 1];
      if (after !== undefined && (TITLE_RULE.test(after) || HEADING_RULE.test(after))) break;
      if (TITLE_RULE.test(lines[j]!) || HEADING_RULE.test(lines[j]!) || unsupportedReason(lines[j]!.trim())) break;
      parts.push(lines[j]!.trim());
      j++;
    }
    blocks.push({ kind: 'paragraph', content: inline(parts.join(' '), lineNo) });
    i = j;
  }

  return { model: canonicalise({ blocks }), diagnostics };
}

interface Frame { indent: number; list: ListBlock }

function readList(
  lines: string[],
  start: number,
  diagnostics: DiagnosticsList,
  inline: (raw: string, lineNo: number) => ListItem['content'],
): { list: ListBlock; next: number } {
  const raw = new Map<ListItem, { text: string; line: number }>();
  const newList = (kind: ListBlock['kind']): ListBlock => ({ kind, items: [] });
  const newItem = (list: ListBlock, text: string, line: number) => {
    const item: ListItem = { content: [], children: [] };
    raw.set(item, { text, line });
    list.items.push(item);
  };

  const stack: Frame[] = [];
  let root: ListBlock | null = null;
  let i = start;

  while (i < lines.length) {
    const m = listMatch(lines[i]!);
    if (!m) {
      const cont = lines[i]!;
      if (!isBlank(cont) && /^\s{2,}\S/.test(cont) && !startsBlock(cont) && stack.length) {
        const last = stack[stack.length - 1]!.list.items.at(-1)!;
        raw.get(last)!.text += ' ' + cont.trim();
        i++;
        continue;
      }
      break;
    }
    const indent = m[1]!.length;
    const kind: ListBlock['kind'] = /^\d/.test(m[2]!) ? 'numberedList' : 'bulletList';
    const text = m[3] ?? '';

    if (stack.length === 0) {
      root = newList(kind);
      stack.push({ indent, list: root });
    } else {
      while (stack.length > 1 && indent < stack[stack.length - 1]!.indent) stack.pop();
      const top = stack[stack.length - 1]!;
      if (indent > top.indent) {
        if (stack.length >= MAX_LIST_DEPTH) {
          diagnostics.add(i + 1, `lists nest at most ${MAX_LIST_DEPTH} levels; this item was moved up to level ${MAX_LIST_DEPTH}`);
        } else {
          const child = newList(kind);
          top.list.items.at(-1)!.children.push(child);
          stack.push({ indent, list: child });
        }
      } else if (top.list.kind !== kind) {
        if (stack.length === 1) break; // a different list type at top level starts a new block
        stack.pop();
        const child = newList(kind);
        stack[stack.length - 1]!.list.items.at(-1)!.children.push(child);
        stack.push({ indent, list: child });
      }
    }
    newItem(stack[stack.length - 1]!.list, text, i + 1);
    i++;
  }

  for (const [item, { text, line }] of raw) item.content = inline(text.trim(), line);
  return { list: root!, next: i };
}
