import { Editor } from '@tiptap/core';
import { parse, serialize } from '../core/index.ts';
import { TextSelection } from '@tiptap/pm/state';
import type { Diagnostic, DocumentModel } from '../core/index.ts';
import type { Settings } from '../shared/messages.ts';
import { buildExtensions, isAllowedLink } from './extensions.ts';
import { ImageHandler, imageFilesOf } from './imageHandler.ts';
import type { Confirm, ImageHost } from './imageHandler.ts';
import { docToModel, modelToDoc } from './modelBridge.ts';
import type { PMNode } from './modelBridge.ts';
import { pasteGuardProps } from './pasteGuard.ts';
import { slashMenuExtension } from './slashMenu.ts';

export type CommandId =
  | 'text' | 'title' | 'heading' | 'subheading'
  | 'bold' | 'italic' | 'underline' | 'code'
  | 'bulletList' | 'numberedList' | 'link' | 'image' | 'separator' | 'codeBlock';

/** Asks the person for a line of text (an address); null means cancelled. */
export type Ask = (label: string, initial?: string) => Promise<string | null>;

export type { Confirm, ImageHost } from './imageHandler.ts';

export interface SelectionState {
  block: 'text' | 'title' | 'heading' | 'subheading' | 'other';
  active: Partial<Record<CommandId, boolean>>;
}

export interface EditorSurfaceOptions {
  element: HTMLElement;
  text: string;
  ask: Ask;
  confirm?: Confirm;
  /** Where pasted pictures are stored; without it they are embedded. */
  images?: ImageHost;
  /** Inside VS Code undo and redo belong to the document. */
  externalHistory?: boolean;
  settings?: Partial<Settings>;
  /** Called whenever text is read from the file, with what the parser could not honour. */
  onDiagnostics?: (items: readonly Diagnostic[]) => void;
  /** Called with canonical file text after every edit made on screen. */
  onEdit?: (text: string) => void;
}

/**
 * EditorSurface: the editable page. Configured with the allowed-content schema, so it can
 * only produce allowed content. Undo and redo come from the engine (the host replaces them
 * with VS Code's own in phase 3).
 */
export class EditorSurface {
  readonly editor: Editor;
  private readonly ask: Ask;
  private applying = false;
  private readonly onDiagnostics?: (items: readonly Diagnostic[]) => void;
  private readonly images: ImageHandler;
  settings: Settings = { lineSpacing: 1.8, imageStorage: 'assetsFolder', embedWarningKB: 500 };

  constructor(opts: EditorSurfaceOptions) {
    this.ask = opts.ask;
    if (opts.settings) this.applySettings(opts.settings);
    this.images = new ImageHandler({
      settings: () => this.settings,
      host: opts.images,
      confirm: opts.confirm ?? (async () => true),
      insert: (src, alt) => this.insertBlock({ type: 'image', attrs: { src, alt } }),
    });
    this.onDiagnostics = opts.onDiagnostics;
    const first = parse(opts.text);
    this.editor = new Editor({
      element: opts.element,
      extensions: [...buildExtensions({ history: !opts.externalHistory }), slashMenuExtension((id) => this.applyCommand(id))],
      content: modelToDoc(first.model),
      editorProps: {
        ...pasteGuardProps,
        handlePaste: (_view, event) => {
          const files = imageFilesOf(event.clipboardData);
          // a picture on the clipboard alongside text is usually a rendering of that text
          if (files.length === 0 || event.clipboardData?.getData('text/plain').trim()) return false;
          void this.images.insertFromPaste(files);
          return true;
        },
        handleDrop: (view, event) => {
          const files = imageFilesOf(event.dataTransfer);
          if (files.length === 0) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
          void this.images.insertFromPaste(files);
          return true;
        },
        attributes: { 'aria-label': 'Document', role: 'textbox', 'aria-multiline': 'true' },
      },
      onUpdate: () => {
        if (!this.applying) opts.onEdit?.(this.currentText());
      },
    });
    // Links open only with Ctrl or Cmd held; a plain click just places the cursor.
    opts.element.addEventListener('click', (e) => {
      if ((e.target as HTMLElement | null)?.closest('a') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    this.onDiagnostics?.(first.diagnostics.items());
  }

  /** Applies settings from the host (line spacing, picture storage). */
  applySettings(next: Partial<Settings>): void {
    this.settings = { ...this.settings, ...next };
    document.documentElement.style.setProperty('--umk-line-height', String(this.settings.lineSpacing));
  }

  currentModel(): DocumentModel {
    return docToModel(this.editor.getJSON() as PMNode);
  }

  currentText(): string {
    return serialize(this.currentModel());
  }

  /** Replaces the whole document without reporting it as an edit (change from outside). */
  load(text: string): void {
    const { from, to } = this.editor.state.selection;
    this.applying = true;
    try {
      const read = parse(text);
      this.editor.commands.setContent(modelToDoc(read.model), { emitUpdate: false });
      this.onDiagnostics?.(read.diagnostics.items());
      // keep the cursor at the nearest valid place
      const doc = this.editor.state.doc;
      const clamp = (n: number) => Math.min(n, doc.content.size);
      this.editor.view.dispatch(
        this.editor.state.tr.setSelection(TextSelection.between(doc.resolve(clamp(from)), doc.resolve(clamp(to)))).setMeta('addToHistory', false),
      );
    } finally {
      this.applying = false;
    }
  }

  selectionState(): SelectionState {
    const e = this.editor;
    const level = e.isActive('heading', { level: 1 }) ? 'title' : e.isActive('heading', { level: 2 }) ? 'heading'
      : e.isActive('heading', { level: 3 }) ? 'subheading' : e.isActive('paragraph') ? 'text' : 'other';
    return {
      block: level,
      active: {
        bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
        code: e.isActive('code'), link: e.isActive('link'),
        bulletList: e.isActive('bulletList'), numberedList: e.isActive('orderedList'), codeBlock: e.isActive('codeBlock'),
      },
    };
  }

  /** Runs one toolbar or slash-menu command. Resolves to whether it changed anything. */
  async applyCommand(id: CommandId): Promise<boolean> {
    const chain = () => this.editor.chain().focus();
    switch (id) {
      case 'text': return chain().setParagraph().run();
      case 'title': return chain().setHeading({ level: 1 }).run();
      case 'heading': return chain().setHeading({ level: 2 }).run();
      case 'subheading': return chain().setHeading({ level: 3 }).run();
      case 'bold': return chain().toggleBold().run();
      case 'italic': return chain().toggleItalic().run();
      case 'underline': return chain().toggleUnderline().run();
      case 'code': return chain().toggleCode().run();
      case 'bulletList': return chain().toggleBulletList().run();
      case 'numberedList': return chain().toggleOrderedList().run();
      case 'codeBlock': return chain().setCodeBlock().run();
      case 'separator': return this.insertBlock({ type: 'horizontalRule' });
      case 'link': return this.applyLink();
      case 'image': {
        const src = (await this.ask('Image address (web address or file path)'))?.trim();
        return src ? this.insertBlock({ type: 'image', attrs: { src, alt: '' } }) : false;
      }
    }
  }

  private async applyLink(): Promise<boolean> {
    const e = this.editor;
    const current = e.isActive('link') ? (e.getAttributes('link').href as string) : '';
    const answer = await this.ask('Link address', current);
    if (answer === null) return false;
    const href = answer.trim();
    if (href === '') return e.chain().focus().extendMarkRange('link').unsetLink().run();
    if (!isAllowedLink(href)) return false;
    if (e.state.selection.empty && !e.isActive('link')) {
      return e.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    }
    return e.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  /** Puts a block in place of an empty line, or after the block the cursor is in. */
  insertBlock(node: PMNode): boolean {
    const { $from, $to } = this.editor.state.selection;
    const topIndex = $from.depth === 0 ? 0 : 1;
    const emptyLine = $from.depth === 1 && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0;
    const range = emptyLine ? { from: $from.before(1), to: $from.after(1) } : $to.depth === 0 ? $to.pos : $to.after(topIndex);
    return this.editor.chain().focus().insertContentAt(range, node).run();
  }

  destroy(): void {
    this.editor.destroy();
  }
}
