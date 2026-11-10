import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { MAX_LIST_DEPTH } from '../core/index.ts';

function listDepth(node: PMNode, depth = 0): number {
  const here = node.type.name === 'bulletList' || node.type.name === 'orderedList' ? depth + 1 : depth;
  let max = here;
  node.forEach((child) => {
    max = Math.max(max, listDepth(child, here));
  });
  return max;
}

/**
 * BlockGapNavigator. The gap cursor (arrow keys between neighbouring blocks, typing creates
 * a paragraph) and the always-present last empty line come from StarterKit; this adds
 * "Enter on an empty last line of a code block steps out", and keeps lists within three levels.
 */
export const BlockGapNavigator = Extension.create({
  name: 'blockGapNavigator',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        const block = $from.parent;
        if (!empty || block.type.name !== 'codeBlock') return false;
        const atEnd = $from.parentOffset === block.content.size;
        if (!atEnd || !block.textContent.endsWith('\n')) return false;
        const after = $from.after();
        return editor
          .chain()
          .command(({ tr, dispatch }) => {
            if (!dispatch) return true;
            tr.delete($from.pos - 1, $from.pos); // the empty last line
            const paragraph = state.schema.nodes.paragraph!.create();
            tr.insert(after - 1, paragraph);
            tr.setSelection(TextSelection.create(tr.doc, after));
            return true;
          })
          .scrollIntoView()
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listDepthGuard'),
        filterTransaction: (tr) => !tr.docChanged || listDepth(tr.doc) <= MAX_LIST_DEPTH,
      }),
    ];
  },
});
