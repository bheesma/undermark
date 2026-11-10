import { Code } from '@tiptap/extension-code';
import { Heading } from '@tiptap/extension-heading';
import { ListItem } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';
import type { AnyExtension } from '@tiptap/core';
import { BlockGapNavigator } from './blockGap.ts';
import { CodeBlock } from './codeHighlighter.ts';
import { Image } from './imageNode.ts';

/** Web addresses, mail links, in-page and relative links; never javascript: and the like. */
export function isAllowedLink(href: string): boolean {
  return /^(https?:|mailto:|#|\/|\.\.?\/)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * The editor's schema: the single list of what a document may contain (DocumentModel in the
 * editor's terms). Everything not listed here cannot exist in the editor (R14).
 */
export function buildExtensions(options: { history?: boolean } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      blockquote: false,
      strike: false,
      hardBreak: false,
      code: false,
      codeBlock: false,
      listItem: false,
      // headings hold plain text only
      heading: false,
      // inside VS Code, undo and redo belong to the document, not the page
      undoRedo: options.history === false ? false : undefined,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: (url: string) => isAllowedLink(url),
        HTMLAttributes: { rel: 'noopener noreferrer', target: null, class: 'umk-link' },
      },
    }),
    // Allowed to combine with every other style (the file format allows it)
    Code.extend({ excludes: '' }),
    // A list item is one line of text, then optional nested lists
    ListItem.extend({ content: 'paragraph (bulletList | orderedList)*' }),
    Heading.extend({ marks: '' }).configure({ levels: [1, 2, 3] }),
    CodeBlock,
    Image,
    BlockGapNavigator,
  ];
}
