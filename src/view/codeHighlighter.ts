import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

/** Languages offered by the picker; no automatic detection. */
export function languages(): string[] {
  return lowlight.listLanguages().sort();
}

/**
 * Code block with syntax colouring (token classes are mapped to theme colours in editor.css)
 * and a language picker. Pressing Enter on an empty last line leaves the block (BlockGapNavigator).
 */
// isolating lets the cursor sit in the gap between two neighbouring code blocks
export const CodeBlock = CodeBlockLowlight.extend({
  isolating: true,
  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const dom = document.createElement('div');
      dom.className = 'umk-codeblock';

      const select = document.createElement('select');
      select.className = 'umk-codeblock-language';
      select.contentEditable = 'false';
      select.setAttribute('aria-label', 'Code language');
      const fill = (language: string | null) => {
        const names = languages();
        if (language && !names.includes(language)) names.unshift(language);
        select.replaceChildren(
          ...['', ...names].map((name) => {
            const o = document.createElement('option');
            o.value = name;
            o.textContent = name || 'plain text';
            return o;
          }),
        );
        select.value = language ?? '';
      };
      fill(node.attrs.language ?? null);
      select.addEventListener('change', () => {
        const pos = getPos();
        if (pos === undefined) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: select.value || null }));
      });

      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.append(code);
      dom.append(select, pre);

      return {
        dom,
        contentDOM: code,
        update(next) {
          if (next.type !== node.type) return false;
          if (next.attrs.language !== node.attrs.language) fill(next.attrs.language ?? null);
          node = next;
          return true;
        },
        stopEvent: (e) => e.target === select,
        ignoreMutation: (m) => !code.contains(m.target),
      };
    };
  },
}).configure({ lowlight, defaultLanguage: null, exitOnTripleEnter: false, exitOnArrowDown: true });
