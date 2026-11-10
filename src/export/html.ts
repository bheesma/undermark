import { common, createLowlight } from 'lowlight';
import type { Block, DocumentModel, ListBlock, Mark, TextRun } from '../core/index.ts';
import { EXPORT_CSS } from './style.ts';

const lowlight = createLowlight(common);

export interface HtmlOptions {
  title?: string;
  /** Turns a picture address from the document into the one the page should use (for example a data address). */
  resolveImage?: (src: string) => string;
  /** Marks the page as destined for paper: always the light colours. */
  print?: boolean;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Same rule as the editor: web, mail, anchors and relative addresses; never script-like schemes. */
export function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|#|\/|\.\.?\/)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function wrap(html: string, mark: Mark): string {
  switch (mark.type) {
    case 'link': return isSafeHref(mark.href) ? `<a href="${escapeHtml(mark.href)}">${html}</a>` : html;
    case 'bold': return `<strong>${html}</strong>`;
    case 'italic': return `<em>${html}</em>`;
    case 'underline': return `<u>${html}</u>`;
    case 'code': return `<code>${html}</code>`;
  }
}

function runs(content: TextRun[]): string {
  // marks are stored outermost first, so wrap from the last to the first
  return content.map((r) => r.marks.reduceRight((html, m) => wrap(html, m), escapeHtml(r.text))).join('');
}

function list(l: ListBlock): string {
  const tag = l.kind === 'bulletList' ? 'ul' : 'ol';
  const items = l.items.map((i) => `<li>${runs(i.content)}${i.children.map(list).join('')}</li>`);
  return `<${tag}>${items.join('')}</${tag}>`;
}

interface HastNode { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: HastNode[] }

function hast(node: HastNode): string {
  if (node.type === 'text') return escapeHtml(node.value ?? '');
  const inner = (node.children ?? []).map(hast).join('');
  if (node.type !== 'element') return inner;
  const cls = node.properties?.className?.join(' ');
  return cls ? `<span class="${escapeHtml(cls)}">${inner}</span>` : inner;
}

function code(text: string, language: string | null): string {
  let body = escapeHtml(text);
  if (language && lowlight.registered(language)) body = hast(lowlight.highlight(language, text) as HastNode);
  const cls = language ? ` class="language-${escapeHtml(language)}"` : '';
  return `<pre><code${cls}>${body}</code></pre>`;
}

function block(b: Block, opts: HtmlOptions): string {
  switch (b.kind) {
    case 'title': return `<h1>${runs(b.content)}</h1>`;
    case 'heading': return `<h2>${runs(b.content)}</h2>`;
    case 'subheading': return `<h3>${runs(b.content)}</h3>`;
    case 'paragraph': return `<p>${runs(b.content)}</p>`;
    case 'bulletList':
    case 'numberedList': return list(b);
    case 'codeBlock': return code(b.text, b.language);
    case 'separator': return '<hr>';
    case 'image': {
      const src = opts.resolveImage ? opts.resolveImage(b.src) : b.src;
      return `<p><img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt)}"></p>`;
    }
  }
}

/** The document as page content (no <html> wrapper). */
export function renderBody(model: DocumentModel, opts: HtmlOptions = {}): string {
  return model.blocks.map((b) => block(b, opts)).join('\n');
}

export function pageShell(title: string, body: string, opts: Pick<HtmlOptions, 'print'> = {}): string {
  return `<!doctype html>
<html lang="en"${opts.print ? ' class="print"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/** A complete, self-contained page. */
export function exportHtml(model: DocumentModel, opts: HtmlOptions = {}): string {
  return pageShell(opts.title ?? 'Document', renderBody(model, opts), opts);
}

/** An index page linking the exported documents of a folder, in the order given. */
export function exportIndex(title: string, entries: { href: string; label: string }[]): string {
  const items = entries.map((e) => `<li><a href="${escapeHtml(e.href)}">${escapeHtml(e.label)}</a></li>`).join('\n');
  return pageShell(title, `<h1>${escapeHtml(title)}</h1>\n<nav><ul>\n${items}\n</ul></nav>`);
}
