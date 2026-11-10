/**
 * The only things an Undermark document may contain (requirement R14).
 * Pure data and pure functions: no VS Code, no DOM.
 */

export const MAX_LIST_DEPTH = 3;

export type Mark =
  | { type: 'link'; href: string }
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'code' };
export type MarkType = Mark['type'];

/** Canonical nesting order, outermost first. A run's marks are always sorted by it. */
export const MARK_ORDER: readonly MarkType[] = ['link', 'bold', 'italic', 'underline', 'code'];

export interface TextRun {
  text: string;
  marks: Mark[];
}

export type TextBlockKind = 'title' | 'heading' | 'subheading' | 'paragraph';
export interface TextBlock {
  kind: TextBlockKind;
  content: TextRun[];
}
export interface ListItem {
  content: TextRun[];
  children: ListBlock[];
}
export interface ListBlock {
  kind: 'bulletList' | 'numberedList';
  items: ListItem[];
}
export interface CodeBlock {
  kind: 'codeBlock';
  language: string | null;
  text: string;
}
export interface ImageBlock {
  kind: 'image';
  src: string;
  alt: string;
}
export interface SeparatorBlock {
  kind: 'separator';
}
export type Block = TextBlock | ListBlock | CodeBlock | ImageBlock | SeparatorBlock;

export interface DocumentModel {
  blocks: Block[];
}

export function hasMark(run: TextRun, type: MarkType): Mark | undefined {
  return run.marks.find((m) => m.type === type);
}

export function sameMark(a: Mark, b: Mark): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'link') return a.href === (b as typeof a).href;
  return true;
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  return a.length === b.length && a.every((m, i) => sameMark(m, b[i]!));
}

/** Sorts marks canonically, drops empty runs, merges neighbours with identical marks. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const marks = [...run.marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, marks)) last.text += run.text;
    else out.push({ text: run.text, marks });
  }
  return out;
}

/**
 * Whitespace at the edges of a line cannot be stored, so it is dropped. Only runs without
 * marks can lose it: every marked run starts and ends with a visible delimiter.
 */
function trimRunEdges(runs: TextRun[]): TextRun[] {
  const out = normalizeRuns(runs).map((r) => ({ text: r.text, marks: r.marks }));
  while (out.length > 0 && out[0]!.marks.length === 0) {
    out[0]!.text = out[0]!.text.trimStart();
    if (out[0]!.text === '') out.shift();
    else break;
  }
  while (out.length > 0 && out[out.length - 1]!.marks.length === 0) {
    const last = out[out.length - 1]!;
    last.text = last.text.trimEnd();
    if (last.text === '') out.pop();
    else break;
  }
  return normalizeRuns(out);
}

function canonicalList(list: ListBlock): ListBlock | null {
  const items = list.items.map((item) => ({
    content: trimRunEdges(item.content),
    children: item.children.map(canonicalList).filter((c): c is ListBlock => c !== null),
  }));
  return items.length === 0 ? null : { kind: list.kind, items };
}

/**
 * The one stored form of a model: sorted and merged runs, trimmed line edges, and no empty
 * text blocks or lists (contract rule 5). Parser output is already canonical; the serializer
 * canonicalises its input, so parse(serialize(m)) equals canonicalise(m).
 */
export function canonicalise(model: DocumentModel): DocumentModel {
  const blocks: Block[] = [];
  for (const block of model.blocks) {
    switch (block.kind) {
      case 'title':
      case 'heading':
      case 'subheading':
      case 'paragraph': {
        // headings carry plain text only
        const flat = block.kind === 'paragraph' ? block.content : normalizeRuns(block.content.map((r) => ({ text: r.text, marks: [] })));
        const content = trimRunEdges(flat);
        if (content.length > 0) blocks.push({ kind: block.kind, content });
        break;
      }
      case 'bulletList':
      case 'numberedList': {
        const list = canonicalList(block);
        if (list) blocks.push(list);
        break;
      }
      default:
        blocks.push(block);
    }
  }
  return { blocks };
}

const LANGUAGE = /^[^\s`]+$/;

/** Lists every way a model breaks the content rules; empty means valid. */
export function validate(model: DocumentModel): string[] {
  const problems: string[] = [];
  const runs = (where: string, content: TextRun[]) => {
    for (const run of content) {
      if (run.text.includes('\n') || run.text.includes('\r')) problems.push(`${where}: line break inside text`);
      const seen = new Set<string>();
      for (const mark of run.marks) {
        if (!MARK_ORDER.includes(mark.type)) problems.push(`${where}: unknown mark ${String(mark.type)}`);
        if (seen.has(mark.type)) problems.push(`${where}: duplicate ${mark.type} mark`);
        seen.add(mark.type);
        if (mark.type === 'link' && /[\r\n]/.test(mark.href)) problems.push(`${where}: line break in link`);
      }
    }
  };
  const list = (where: string, l: ListBlock, depth: number) => {
    if (depth > MAX_LIST_DEPTH) problems.push(`${where}: list nested deeper than ${MAX_LIST_DEPTH} levels`);
    l.items.forEach((item, i) => {
      runs(`${where} item ${i + 1}`, item.content);
      item.children.forEach((c) => list(`${where} item ${i + 1}`, c, depth + 1));
    });
  };
  model.blocks.forEach((block, i) => {
    const where = `block ${i + 1} (${String(block.kind)})`;
    switch (block.kind) {
      case 'title':
      case 'heading':
      case 'subheading':
      case 'paragraph':
        runs(where, block.content);
        break;
      case 'bulletList':
      case 'numberedList':
        list(where, block, 1);
        break;
      case 'codeBlock':
        if (block.language !== null && !LANGUAGE.test(block.language)) problems.push(`${where}: invalid language`);
        break;
      case 'image':
        if (/[\r\n]/.test(block.src + block.alt)) problems.push(`${where}: line break in image`);
        break;
      case 'separator':
        break;
      default:
        problems.push(`${where}: unknown block kind`);
    }
  });
  return problems;
}

/** Visible text of a run list, without marks. */
export function plainText(content: TextRun[]): string {
  return content.map((r) => r.text).join('');
}
