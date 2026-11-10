import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { CommandId } from './editorSurface.ts';

export interface SlashItem {
  id: CommandId;
  title: string;
  keywords: string;
}

export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: 'text', title: 'Text', keywords: 'paragraph plain' },
  { id: 'title', title: 'Title', keywords: 'heading h1 double underline' },
  { id: 'heading', title: 'Heading', keywords: 'h2 underline' },
  { id: 'subheading', title: 'Subheading', keywords: 'h3 bold' },
  { id: 'bulletList', title: 'Bullet list', keywords: 'ul unordered dots' },
  { id: 'numberedList', title: 'Numbered list', keywords: 'ol ordered numbers' },
  { id: 'codeBlock', title: 'Code block', keywords: 'code fence snippet' },
  { id: 'image', title: 'Image', keywords: 'picture photo' },
  { id: 'separator', title: 'Separator', keywords: 'line rule divider hr' },
];

/** Items whose title or keywords contain every typed word, titles first. */
export function filterSlashItems(query: string): SlashItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = SLASH_ITEMS.filter((i) => words.every((w) => `${i.title} ${i.keywords}`.toLowerCase().includes(w)));
  const starts = (i: SlashItem) => (words.length === 0 || i.title.toLowerCase().startsWith(words[0]!) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b));
}

/** SlashMenu: opens on an empty top-level line after "/", never inside code. */
export function slashMenuExtension(run: (id: CommandId) => Promise<boolean>) {
  return Extension.create({
    name: 'slashMenu',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          pluginKey: new PluginKey('slashMenu'),
          editor: this.editor,
          char: '/',
          startOfLine: true,
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            return $from.depth === 1 && $from.parent.type.name === 'paragraph' && $from.parent.textContent.startsWith('/');
          },
          items: ({ query }) => filterSlashItems(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            void run(props.id);
          },
          render: () => {
            let list: HTMLUListElement | null = null;
            let selected = 0;
            let current: { items: SlashItem[]; command: (i: SlashItem) => void } | null = null;
            const paint = () => {
              if (!list || !current) return;
              list.replaceChildren(
                ...current.items.map((item, n) => {
                  const li = document.createElement('li');
                  li.setAttribute('role', 'option');
                  li.setAttribute('aria-selected', String(n === selected));
                  li.className = 'umk-slash-item' + (n === selected ? ' is-selected' : '');
                  li.textContent = item.title;
                  li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    current?.command(item);
                  });
                  return li;
                }),
              );
              if (current.items.length === 0) {
                const li = document.createElement('li');
                li.className = 'umk-slash-empty';
                li.textContent = 'No match';
                list.append(li);
              }
            };
            const place = (rect: (() => DOMRect | null) | null | undefined) => {
              const r = rect?.();
              if (list && r) {
                list.style.left = `${r.left}px`;
                list.style.top = `${r.bottom + 4}px`;
              }
            };
            return {
              onStart(props) {
                list = document.createElement('ul');
                list.className = 'umk-slash-menu';
                list.setAttribute('role', 'listbox');
                list.setAttribute('aria-label', 'Insert block');
                document.body.append(list);
                selected = 0;
                current = props;
                paint();
                place(props.clientRect);
              },
              onUpdate(props) {
                current = props;
                selected = Math.min(selected, Math.max(0, props.items.length - 1));
                paint();
                place(props.clientRect);
              },
              onKeyDown({ event }) {
                if (!current) return false;
                const n = current.items.length;
                if (event.key === 'ArrowDown' && n) { selected = (selected + 1) % n; paint(); return true; }
                if (event.key === 'ArrowUp' && n) { selected = (selected + n - 1) % n; paint(); return true; }
                if (event.key === 'Enter' && n) { current.command(current.items[selected]!); return true; }
                return false; // Escape is handled by the suggestion plugin: the "/" stays as text
              },
              onExit() {
                list?.remove();
                list = null;
                current = null;
              },
            };
          },
        }),
      ];
    },
  });
}
