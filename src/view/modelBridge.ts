import { canonicalise } from '../core/index.ts';
import type { Block, DocumentModel, ListBlock, Mark, TextRun } from '../core/index.ts';

/** Minimal shape of the editor's document JSON (Tiptap / ProseMirror). */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const HEADING_KIND = { 1: 'title', 2: 'heading', 3: 'subheading' } as const;
const HEADING_LEVEL = { title: 1, heading: 2, subheading: 3 } as const;

// ------------------------------------------------------------ model to editor

function textNodes(runs: TextRun[]): PMNode[] {
  return runs.map((run) => ({
    type: 'text',
    text: run.text,
    marks: run.marks.map((m: Mark) => {
      switch (m.type) {
        case 'link': return { type: 'link', attrs: { href: m.href } };
        default: return { type: m.type };
      }
    }),
  }));
}

function listNode(list: ListBlock): PMNode {
  return {
    type: list.kind === 'bulletList' ? 'bulletList' : 'orderedList',
    content: list.items.map((item) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: textNodes(item.content) }, ...item.children.map(listNode)],
    })),
  };
}

function blockNode(block: Block): PMNode {
  switch (block.kind) {
    case 'title':
    case 'heading':
    case 'subheading':
      return { type: 'heading', attrs: { level: HEADING_LEVEL[block.kind] }, content: textNodes(block.content) };
    case 'paragraph': return { type: 'paragraph', content: textNodes(block.content) };
    case 'bulletList':
    case 'numberedList': return listNode(block);
    case 'codeBlock':
      return { type: 'codeBlock', attrs: { language: block.language }, content: block.text ? [{ type: 'text', text: block.text }] : [] };
    case 'image': return { type: 'image', attrs: { src: block.src, alt: block.alt } };
    case 'separator': return { type: 'horizontalRule' };
  }
}

export function modelToDoc(model: DocumentModel): PMNode {
  const content = model.blocks.map(blockNode);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// ------------------------------------------------------------ editor to model

function runsOf(nodes: PMNode[] | undefined): TextRun[] {
  return (nodes ?? []).flatMap((n) => {
    if (n.type !== 'text' || !n.text) return [];
    const marks: Mark[] = [];
    for (const m of n.marks ?? []) {
      switch (m.type) {
        case 'link': marks.push({ type: 'link', href: String(m.attrs?.href ?? '') }); break;
        case 'bold': case 'italic': case 'underline': case 'code': marks.push({ type: m.type }); break;
      }
    }
    return [{ text: n.text, marks }];
  });
}

function listBlock(node: PMNode): ListBlock {
  return {
    kind: node.type === 'orderedList' ? 'numberedList' : 'bulletList',
    items: (node.content ?? []).map((li) => {
      const [first, ...rest] = li.content ?? [];
      return {
        content: first?.type === 'paragraph' ? runsOf(first.content) : [],
        children: rest.filter((n) => n.type === 'bulletList' || n.type === 'orderedList').map(listBlock),
      };
    }),
  };
}

export function docToModel(doc: PMNode): DocumentModel {
  const blocks: Block[] = [];
  for (const n of doc.content ?? []) {
    switch (n.type) {
      case 'paragraph': blocks.push({ kind: 'paragraph', content: runsOf(n.content) }); break;
      case 'heading': blocks.push({ kind: HEADING_KIND[(n.attrs?.level as 1 | 2 | 3) ?? 3] ?? 'subheading', content: runsOf(n.content) }); break;
      case 'bulletList':
      case 'orderedList': blocks.push(listBlock(n)); break;
      case 'codeBlock': {
        const language = typeof n.attrs?.language === 'string' && /^[^\s`]+$/.test(n.attrs.language) ? n.attrs.language : null;
        blocks.push({ kind: 'codeBlock', language, text: (n.content ?? []).map((t) => t.text ?? '').join('') });
        break;
      }
      case 'image': blocks.push({ kind: 'image', src: String(n.attrs?.src ?? '').replace(/[\r\n]/g, ''), alt: String(n.attrs?.alt ?? '').replace(/[\r\n]/g, '') }); break;
      case 'horizontalRule': blocks.push({ kind: 'separator' }); break;
    }
  }
  return canonicalise({ blocks });
}
