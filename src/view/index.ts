import { createPromptBar } from './promptBar.ts';
import { EditorSurface } from './editorSurface.ts';
import type { Ask, Confirm, ImageHost } from './editorSurface.ts';
import type { Settings } from '../shared/messages.ts';
import { Toolbar } from './toolbar.ts';
import { createBanner } from './diagnosticsBanner.ts';

export interface EditorShellOptions {
  root: HTMLElement;
  text: string;
  onEdit?: (text: string) => void;
  /** Replaces the in-page prompt bar (tests). */
  ask?: Ask;
  confirm?: Confirm;
  images?: ImageHost;
  externalHistory?: boolean;
  settings?: Partial<Settings>;
  /** Called when the user moves the line-spacing slider. */
  onSpacing?: (value: number) => void;
}

/** EditorShell: hosts the toolbar, the page and the prompt bar. */
export class EditorShell {
  readonly surface: EditorSurface;
  readonly toolbar: Toolbar;

  constructor(opts: EditorShellOptions) {
    opts.root.classList.add('umk-shell');
    const top = document.createElement('div');
    top.className = 'umk-top';
    const page = document.createElement('div');
    page.className = 'umk-page';
    opts.root.append(top, page);
    const banner = createBanner();
    top.append(banner.element);
    const bar = opts.ask ? null : createPromptBar(top);
    this.surface = new EditorSurface({
      element: page,
      text: opts.text,
      ask: opts.ask ?? bar!.ask,
      confirm: opts.confirm ?? bar?.confirm,
      images: opts.images,
      externalHistory: opts.externalHistory,
      settings: opts.settings,
      onEdit: opts.onEdit,
      onDiagnostics: banner.show,
    });
    this.toolbar = new Toolbar(this.surface, opts.onSpacing);
    top.prepend(this.toolbar.element);
  }
}

export { EditorSurface } from './editorSurface.ts';
export type { Ask, CommandId, Confirm, ImageHost } from './editorSurface.ts';
