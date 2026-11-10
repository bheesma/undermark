import type { CommandId, EditorSurface } from './editorSurface.ts';

interface ButtonSpec {
  id: CommandId;
  label: string;
  text: string;
}

/** Buttons in groups; a divider is drawn between groups. */
const GROUPS: ButtonSpec[][] = [
  [
    { id: 'bold', label: 'Bold', text: 'B' },
    { id: 'italic', label: 'Italic', text: 'I' },
    { id: 'underline', label: 'Underline', text: 'U' },
  ],
  [
    { id: 'bulletList', label: 'Bullet list', text: '•' },
    { id: 'numberedList', label: 'Numbered list', text: '1.' },
  ],
  [
    { id: 'link', label: 'Link', text: 'Link' },
    { id: 'image', label: 'Image', text: 'Image' },
    { id: 'separator', label: 'Separator', text: '―' },
    { id: 'codeBlock', label: 'Code block', text: '{ }' },
  ],
];

/** Buttons that have no meaning inside a title or heading, which hold plain text. */
const INLINE: readonly CommandId[] = ['bold', 'italic', 'underline', 'link'];

/** The line-spacing slider is built but kept out of sight until it is wanted. */
const SHOW_SPACING = false;

const STYLES: { id: CommandId; label: string; value: string }[] = [
  { id: 'text', label: 'Text', value: 'text' },
  { id: 'title', label: 'Title', value: 'title' },
  { id: 'heading', label: 'Heading', value: 'heading' },
  { id: 'subheading', label: 'Subheading', value: 'subheading' },
];

/**
 * The always-visible bar. Buttons show the state of the text under the cursor and send
 * commands to the surface. Everything is a native control, so it works by keyboard alone.
 */
export class Toolbar {
  readonly element: HTMLElement;
  private readonly surface: EditorSurface;
  private readonly style: HTMLSelectElement;
  private readonly buttons = new Map<CommandId, HTMLButtonElement>();
  private spacingInput!: HTMLInputElement;
  private spacingValue!: HTMLElement;
  private keepStop: () => void = () => {};

  constructor(surface: EditorSurface, onSpacing?: (value: number) => void) {
    this.surface = surface;
    const bar = (this.element = document.createElement('div'));
    bar.className = 'umk-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Formatting');

    this.style = document.createElement('select');
    this.style.setAttribute('aria-label', 'Paragraph style');
    for (const s of STYLES) {
      const o = document.createElement('option');
      o.value = s.value;
      o.textContent = s.label;
      this.style.append(o);
    }
    this.style.addEventListener('change', () => {
      const spec = STYLES.find((s) => s.value === this.style.value);
      if (spec) void this.surface.applyCommand(spec.id);
    });
    bar.append(this.style);

    for (const group of GROUPS) {
      bar.append(this.divider());
      for (const spec of group) {
        const b = this.button(spec.label, spec.text, () => void this.surface.applyCommand(spec.id));
        b.dataset.command = spec.id;
        this.buttons.set(spec.id, b);
        bar.append(b);
      }
    }

    bar.append(this.spacing(onSpacing));

    this.rove(bar);

    surface.editor.on('selectionUpdate', () => this.reflect());
    surface.editor.on('transaction', () => this.reflect());
    this.reflect();
  }

  /**
   * One Tab stop for all the buttons: arrow keys, Home and End move between them, and Escape
   * returns to the page. The style list and the slider keep their own keys and stay Tab stops.
   */
  private rove(bar: HTMLElement): void {
    const items = () => [...bar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const setCurrent = (current: HTMLButtonElement) => bar.querySelectorAll('button').forEach((b) => (b.tabIndex = b === current ? 0 : -1));
    this.keepStop = () => {
      if (!items().some((b) => b.tabIndex === 0)) setCurrent(items()[0]!);
    };
    setCurrent(items()[0]!);
    bar.addEventListener('focusin', (e) => {
      const target = (e.target as HTMLElement | null)?.closest('button');
      if (target) setCurrent(target);
    });
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.surface.editor.commands.focus();
        return;
      }
      const list = items();
      const at = list.indexOf(e.target as HTMLButtonElement);
      if (at < 0) return;
      const next = e.key === 'ArrowRight' ? (at + 1) % list.length
        : e.key === 'ArrowLeft' ? (at - 1 + list.length) % list.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      list[next]!.focus();
    });
  }

  private button(label: string, text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', 'false');
    b.textContent = text;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection in the page
    b.addEventListener('click', onClick);
    return b;
  }

  private divider(): HTMLElement {
    const d = document.createElement('span');
    d.className = 'umk-divider';
    d.setAttribute('role', 'separator');
    return d;
  }

  /** Line spacing slider at the right end of the bar, with the resulting line height in pixels. */
  private spacing(onChange?: (value: number) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'umk-spacing';
    label.hidden = !SHOW_SPACING;
    label.append('Line spacing');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '1';
    input.max = '2.5';
    input.step = '0.1';
    input.value = String(this.surface.settings.lineSpacing);
    input.setAttribute('aria-label', 'Line spacing');
    input.title = 'Line spacing: a multiple of the font size';
    input.addEventListener('input', () => {
      this.surface.applySettings({ lineSpacing: Number(input.value) });
      this.showSpacing();
    });
    // the setting is written once, when the slider is released
    input.addEventListener('change', () => onChange?.(Number(input.value)));
    this.spacingInput = input;
    this.spacingValue = document.createElement('output');
    this.spacingValue.className = 'umk-spacing-value';
    label.append(input, this.spacingValue);
    this.showSpacing();
    return label;
  }

  /** "1.5 × · 21 px": the multiple and the line height it gives at the current font size. */
  private showSpacing(): void {
    const factor = this.surface.settings.lineSpacing;
    const size = parseFloat(getComputedStyle(this.surface.editor.view.dom).fontSize) || 14;
    this.spacingValue.textContent = `${factor.toFixed(1)}× · ${Math.round(factor * size * 10) / 10} px`;
  }

  /** Keeps the slider in step with a setting changed elsewhere. */
  syncSpacing(): void {
    this.spacingInput.value = String(this.surface.settings.lineSpacing);
    this.showSpacing();
  }

  /** Shows the state of the selection. */
  reflect(): void {
    const state = this.surface.selectionState();
    this.style.value = state.block === 'other' ? 'text' : state.block;
    for (const [id, b] of this.buttons) b.setAttribute('aria-pressed', String(!!state.active[id]));
    const plain = state.block === 'title' || state.block === 'heading' || state.block === 'subheading';
    for (const id of INLINE) this.buttons.get(id)!.disabled = plain;
    this.keepStop();
    this.showSpacing();
  }
}
