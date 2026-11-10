import { EditorShell } from '../src/view/index.ts';

const SAMPLE = `Welcome to Undermark
====================

A Heading
---------

# A subheading

Plain text with **bold**, *italic*, __underline__, ~highlight~, ~green~{green}, \`inline code\` and a [link](https://example.com).

- First item
- Second item
    - Nested item

1. One
2. Two

\`\`\`ts
const answer: number = 42; // syntax colouring
\`\`\`

\`\`\`py
print("two code blocks, with a gap between them")
\`\`\`

***

Type / on an empty line for the insert menu.
`;

const file = document.getElementById('file')!;
const shell = new EditorShell({
  root: document.getElementById('root')!,
  text: SAMPLE,
  onEdit: (text) => { file.textContent = text; },
});
file.textContent = shell.surface.currentText();

document.getElementById('theme')!.addEventListener('change', (e) => {
  document.body.className = (e.target as HTMLSelectElement).value;
});
document.getElementById('spacing')!.addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--umk-line-height', (e.target as HTMLInputElement).value);
});
(window as unknown as { shell: EditorShell }).shell = shell;
