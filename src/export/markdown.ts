import type { Block, DocumentModel, ListBlock, Mark, TextRun } from '../core/index.ts';

export interface MarkdownOptions {
  /** Turns a picture address from the document into the one the Markdown file should use. */
  resolveImage?: (src: string) => string;
}

/** Characters that mean something in Markdown text. */
function escapeText(s: string): string {
  return s.replace(/[\\`*_~[\]<>&]/g, (c) => `\\${c}`);
}

/** Markdown emphasis fails next to spaces, so the spaces are moved outside the markers. */
function delimit(open: string, close: string, text: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return m[2] === '' ? text : `${m[1]}${open}${m[2]}${close}${m[3]}`;
}

function inlineCode(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((t) => t.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return delimit(fence + pad, pad + fence, text);
}

function address(src: string): string {
  return /[\s()<>]/.test(src) ? `<${src.replace(/[<>]/g, encodeURIComponent)}>` : src;
}

function apply(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'link': return `[${text}](${address(mark.href)})`;
    case 'bold': return delimit('**', '**', text);
    case 'italic': return delimit('*', '*', text);
    case 'underline': return delimit('<u>', '</u>', text); // __ would mean bold in Markdown (contract D7)
    case 'code': return text; // handled with the literal text
  }
}

function runs(content: TextRun[]): string {
  return content
    .map((r) => {
      const isCode = r.marks.some((m) => m.type === 'code');
      const base = isCode ? inlineCode(r.text) : escapeText(r.text);
      return r.marks.reduceRight((t, m) => apply(t, m), base);
    })
    .join('');
}

/** Stops a line that starts like a Markdown block from becoming one. */
function guardLineStart(line: string): string {
  return line.replace(/^(\s*)(#|-|\+|=|\d+[.)])(?=\s|$|#)/, '$1\\$2');
}

function list(l: ListBlock, depth: number): string[] {
  const out: string[] = [];
  l.items.forEach((item, i) => {
    const marker = l.kind === 'bulletList' ? '-' : `${i + 1}.`;
    out.push(`${'    '.repeat(depth)}${marker} ${runs(item.content)}`);
    for (const child of item.children) out.push(...list(child, depth + 1));
  });
  return out;
}

function fenced(text: string, language: string | null): string {
  const longest = Math.max(2, ...(text.match(/`{3,}/gm) ?? []).map((t) => t.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language ?? ''}\n${text}\n${fence}`;
}

function block(b: Block, opts: MarkdownOptions): string {
  switch (b.kind) {
    case 'title': return `# ${runs(b.content)}`;
    case 'heading': return `## ${runs(b.content)}`;
    case 'subheading': return `### ${runs(b.content)}`;
    case 'paragraph': return guardLineStart(runs(b.content));
    case 'bulletList':
    case 'numberedList': return list(b, 0).join('\n');
    case 'codeBlock': return fenced(b.text, b.language);
    case 'separator': return '---';
    case 'image': {
      const src = opts.resolveImage ? opts.resolveImage(b.src) : b.src;
      return `![${b.alt.replace(/[\\[\]]/g, (c) => `\\${c}`)}](${address(src)})`;
    }
  }
}

export function exportMarkdown(model: DocumentModel, opts: MarkdownOptions = {}): string {
  return model.blocks.length === 0 ? '' : model.blocks.map((b) => block(b, opts)).join('\n\n') + '\n';
}
