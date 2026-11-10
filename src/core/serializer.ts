import { canonicalise } from './documentModel.ts';
import type { Block, DocumentModel, ListBlock, TextRun } from './documentModel.ts';
import { escapeAddress, escapeAlt, serializeInline } from './inline.ts';

/** Stops a line from being read as a block marker when it is really text. */
function escapeLineStart(line: string): string {
  if (/^[#\-=>|<]/.test(line)) return '\\' + line;
  return line.replace(/^(\d+)([.)])/, '$1\\$2');
}

function textLine(content: TextRun[]): string {
  return escapeLineStart(serializeInline(content));
}

function listLines(list: ListBlock, depth: number): string[] {
  const pad = '    '.repeat(depth);
  const out: string[] = [];
  list.items.forEach((item, n) => {
    const marker = list.kind === 'bulletList' ? '-' : `${n + 1}.`;
    const text = serializeInline(item.content);
    out.push(text ? `${pad}${marker} ${text}` : `${pad}${marker}`);
    for (const child of item.children) out.push(...listLines(child, depth + 1));
  });
  return out;
}

function codeLines(language: string | null, text: string): string[] {
  const body = text === '' ? [] : text.split('\n');
  let size = 3;
  for (const line of body) {
    const run = /^ {0,3}(`+)\s*$/.exec(line);
    if (run) size = Math.max(size, run[1]!.length + 1);
  }
  const fence = '`'.repeat(size);
  return [fence + (language ?? ''), ...body, fence];
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'title': {
      const line = textLine(block.content);
      return `${line}\n${'='.repeat(Math.max(3, line.length))}`;
    }
    case 'heading': {
      const line = textLine(block.content);
      return `${line}\n${'-'.repeat(Math.max(3, line.length))}`;
    }
    case 'subheading': return `# ${serializeInline(block.content)}`;
    case 'paragraph': return textLine(block.content);
    case 'bulletList':
    case 'numberedList': return listLines(block, 0).join('\n');
    case 'codeBlock': return codeLines(block.language, block.text).join('\n');
    case 'image': return `![${escapeAlt(block.alt)}](${escapeAddress(block.src)})`;
    case 'separator': return '***';
  }
}

/** Writes the single canonical text form: blocks separated by one blank line, ending in a newline. */
export function serialize(model: DocumentModel): string {
  const { blocks } = canonicalise(model);
  return blocks.length === 0 ? '' : blocks.map(blockText).join('\n\n') + '\n';
}
