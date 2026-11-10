import './helpers/dom.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GapCursor } from '@tiptap/pm/gapcursor';
import * as pmView from '@tiptap/pm/view';
import type { Slice } from '@tiptap/pm/model';
import type { ResolvedPos } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { parse, plainText, serialize, validate } from '../src/core/index.ts';
import { EditorShell } from '../src/view/index.ts';
import type { Ask } from '../src/view/index.ts';
import { docToModel, modelToDoc } from '../src/view/modelBridge.ts';
import type { PMNode } from '../src/view/modelBridge.ts';
import { filterSlashItems, SLASH_ITEMS } from '../src/view/slashMenu.ts';

function mount(text = '', answers: (string | null)[] = []) {
  const root = document.createElement('div');
  document.body.append(root);
  const edits: string[] = [];
  const ask: Ask = async () => (answers.length ? answers.shift()! : null);
  const shell = new EditorShell({ root, text, ask, onEdit: (t) => edits.push(t) });
  return { shell, surface: shell.surface, editor: shell.surface.editor, root, edits };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const sel = (editor: ReturnType<typeof mount>['editor'], from: number, to = from) =>
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));

const SAMPLE = `Title
=====

Plain **bold** *italic* __under__ ~mark~{red} \`code\` [link](https://x.org) and [~**all**~{cyan}](a)

- one
    - two
        - three

1. a
2. b

\`\`\`ts
x
\`\`\`

\`\`\`
y
\`\`\`

![alt](pic.png)

***

end
`;

// ------------------------------------------------------------------ bridge
test('file text loads into the editor and saves back byte-identical', () => {
  const { surface } = mount(SAMPLE);
  assert.equal(surface.currentText(), serialize(parse(SAMPLE).model));
  assert.equal(surface.currentText(), SAMPLE);
});

test('model to editor document and back is lossless', () => {
  const model = parse(SAMPLE).model;
  assert.deepEqual(docToModel(modelToDoc(model)), model);
});

// ----------------------------------------------------------- strict content
const ALLOWED_NODES = new Set(['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'image', 'horizontalRule', 'text']);
const ALLOWED_MARKS = new Set(['bold', 'italic', 'underline', 'code', 'link']);

// ProseMirror's own clipboard reader (what a real paste runs), exported without types
const __parseFromClipboard = (pmView as unknown as { __parseFromClipboard: (view: unknown, text: string, html: string, plain: boolean, $ctx: ResolvedPos) => Slice | null }).__parseFromClipboard;

function pasted(editor: ReturnType<typeof mount>['editor'], html: string): PMNode {
  const slice = __parseFromClipboard(editor.view, '', html, false, editor.state.doc.resolve(1));
  assert.ok(slice);
  const tr = editor.state.tr.replaceSelection(slice!);
  return { type: 'doc', content: (tr.doc.toJSON() as PMNode).content };
}
function kinds(n: PMNode, nodes = new Set<string>(), marks = new Set<string>()) {
  nodes.add(n.type);
  n.marks?.forEach((m) => marks.add(m.type));
  n.content?.forEach((c) => kinds(c, nodes, marks));
  return { nodes, marks };
}

const WORD = `<html><head><style>p.MsoNormal{font-family:Calibri}</style></head><body><!--StartFragment-->
<p class="MsoNormal" style="font-family:'Comic Sans MS';font-size:24pt;color:red">Fancy <span style="font-weight:700">bold</span> and <span style="font-style:italic">slanted</span> <o:p></o:p>words</p><!--EndFragment--></body></html>`;
const WEB = `<div class="x" style="color:blue"><script>alert(1)</script><blockquote>Quoted words</blockquote><h4>Small head</h4><p><s>struck</s> <a href="javascript:alert(1)">bad link</a> <a href="https://ok.org">good link</a> <font face="Arial" size="7">sized</font></p><img src="file:///c:/secret.png"><img src="https://x.org/a.png" alt="ok"></div>`;
const SHEET = `<table style="border:1px"><tr><td style="background:#ff0">A1</td><td>B1</td></tr><tr><td>A2</td><td><b>B2</b></td></tr></table>`;

test('content pasted from a word processor, a web page and a spreadsheet keeps only allowed content and the words', () => {
  const { editor } = mount('');
  for (const [name, html, words] of [
    ['word', WORD, 'Fancy bold and slanted words'],
    ['web', WEB, 'Quoted wordsSmall headstruck bad link good link sized'],
    ['sheet', SHEET, 'A1 B1A2 B2'],
  ] as const) {
    const doc = pasted(editor, html);
    const { nodes, marks } = kinds(doc);
    for (const n of nodes) assert.ok(ALLOWED_NODES.has(n), `${name}: node ${n}`);
    for (const m of marks) assert.ok(ALLOWED_MARKS.has(m), `${name}: mark ${m}`);
    assert.deepEqual(validate(docToModel(doc)), [], name);
    const text = JSON.stringify(doc).match(/"text":"([^"]*)"/g)?.map((t) => t.slice(8, -1)).join('') ?? '';
    assert.equal(text.replace(/\s/g, ''), words.replace(/\s/g, ''), name);
  }
});

test('pasted fonts, sizes, colours and unsafe links or pictures are discarded', () => {
  const { editor } = mount('');
  const json = JSON.stringify(pasted(editor, WEB));
  assert.ok(!json.includes('javascript:'));
  assert.ok(!json.includes('file:'));
  assert.ok(json.includes('https://ok.org'));
  assert.ok(json.includes('https://x.org/a.png'));
  const word = JSON.stringify(pasted(editor, WORD));
  assert.ok(!/Comic|font|color|24pt|red/i.test(word));
  assert.ok(word.includes('"bold"') && word.includes('"italic"'));
});

// ---------------------------------------------------------------- commands
test('each style button produces the right result and the toolbar reflects it', async () => {
  const { surface, editor, root } = mount('hello world\n');
  sel(editor, 1, 6);
  for (const [id, mark] of [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['code', 'code']] as const) {
    await surface.applyCommand(id);
    assert.ok(editor.isActive(mark), id);
    const button = root.querySelector(`[data-command="${id}"]`);
    if (button) assert.equal(button.getAttribute('aria-pressed'), 'true', `${id} reflected`);
  }
  assert.deepEqual(surface.currentModel().blocks[0] && 'content' in surface.currentModel().blocks[0] ? (surface.currentModel().blocks[0] as { content: { marks: { type: string }[] }[] }).content[0]!.marks.map((m) => m.type) : [],
    ['bold', 'italic', 'underline', 'code']);
  await surface.applyCommand('bold');
  assert.ok(!editor.isActive('bold'));
});

test('the toolbar is one Tab stop and arrow keys move between its buttons', async () => {
  const { root, editor } = mount('hi\n');
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.umk-toolbar button')];
  assert.equal(buttons.filter((b) => b.tabIndex === 0).length, 1);
  const key = (el: Element, k: string) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  buttons[0]!.focus();
  key(buttons[0]!, 'ArrowRight');
  assert.equal(document.activeElement, buttons[1]);
  assert.equal(buttons[1]!.tabIndex, 0);
  assert.equal(buttons[0]!.tabIndex, -1);
  key(buttons[1]!, 'End');
  assert.equal(document.activeElement, buttons.at(-1));
  key(buttons.at(-1)!, 'ArrowRight');
  assert.equal(document.activeElement, buttons[0]);
  key(buttons[0]!, 'Escape');
  await tick();
  assert.ok(editor.isFocused);
});

test('headings hold plain text: no formatting buttons, no formatting kept', async () => {
  const { surface, editor, root } = mount('Head\n----\n\nbody\n');
  sel(editor, 1, 4);
  assert.equal((root.querySelector('[data-command="bold"]') as HTMLButtonElement).disabled, true);
  await surface.applyCommand('bold');
  assert.ok(!editor.isActive('bold'));
  assert.equal(surface.currentText(), 'Head\n----\n\nbody\n');
  assert.equal(root.querySelector('[data-command="highlight"]'), null);
  assert.equal(root.querySelector('[data-command="code"]'), null);
});

test('the line spacing shows as a multiple and as pixels', () => {
  const { root, surface } = mount('x\n');
  const out = root.querySelector('.umk-spacing-value')!;
  assert.match(out.textContent!, /^1\.8× · \d+(\.\d)? px$/);
  const input = root.querySelector('.umk-spacing input') as HTMLInputElement;
  input.value = '2';
  input.dispatchEvent(new window.Event('input'));
  assert.match(out.textContent!, /^2\.0× /);
});

test('block styles, lists, code block, separator', async () => {
  const { surface, editor, root } = mount('a\n\nb\n\nc\n\nd\n\ne\n');
  const at = (n: number) => { let pos = 0, i = 0; editor.state.doc.forEach((node, off) => { if (i++ === n) pos = off + 1; }); sel(editor, pos); };
  at(0); await surface.applyCommand('title');
  at(1); await surface.applyCommand('heading');
  at(2); await surface.applyCommand('subheading');
  at(3); await surface.applyCommand('bulletList');
  at(4); await surface.applyCommand('numberedList');
  assert.equal(surface.currentText(), 'a\n===\n\nb\n---\n\n# c\n\n- d\n\n1. e\n');
  at(0);
  assert.equal((root.querySelector('select[aria-label="Paragraph style"]') as HTMLSelectElement).value, 'title');
  await surface.applyCommand('text');
  assert.equal(surface.currentText().startsWith('a\n\nb\n---'), true);
  await surface.applyCommand('separator');
  assert.ok(surface.currentText().startsWith('a\n\n***\n\nb'), surface.currentText());
  const m = mount('code\n');
  await m.surface.applyCommand('codeBlock');
  assert.equal(m.surface.currentText(), '```\ncode\n```\n');
});

test('link and image commands ask for an address and refuse unsafe ones', async () => {
  const m = mount('see here\n', ['https://a.org', 'javascript:alert(1)', 'pics/a.png']);
  sel(m.editor, 5, 9);
  await m.surface.applyCommand('link');
  assert.equal(m.surface.currentText(), 'see [here](https://a.org)\n');
  sel(m.editor, 1, 4);
  await m.surface.applyCommand('link');
  assert.ok(!m.surface.currentText().includes('javascript'));
  sel(m.editor, 2);
  await m.surface.applyCommand('image');
  assert.ok(m.surface.currentText().includes('![](pics/a.png)'), m.surface.currentText());
  assert.deepEqual(validate(m.surface.currentModel()), []);
});

test('edits are reported as canonical text; outside changes are not echoed', async () => {
  const m = mount('x\n');
  sel(m.editor, 1, 2);
  await m.surface.applyCommand('bold');
  assert.deepEqual(m.edits, ['**x**\n']);
  m.surface.load('changed\n');
  assert.equal(m.edits.length, 1);
  assert.equal(m.surface.currentText(), 'changed\n');
});

// -------------------------------------------------------------- slash menu
test('slash menu lists the nine blocks, filters, and inserts', async () => {
  assert.deepEqual(SLASH_ITEMS.map((i) => i.title), ['Text', 'Title', 'Heading', 'Subheading', 'Bullet list', 'Numbered list', 'Code block', 'Image', 'Separator']);
  assert.deepEqual(filterSlashItems('bul').map((i) => i.title), ['Bullet list']);
  assert.deepEqual(filterSlashItems('list').map((i) => i.title), ['Bullet list', 'Numbered list']);
  assert.deepEqual(filterSlashItems('zzz'), []);
  const m = mount('');
  m.editor.commands.focus();
  m.editor.commands.insertContent('/');
  await tick();
  const items = document.querySelectorAll('.umk-slash-item');
  assert.equal(items.length, 9, `menu opens after / (items ${items.length}, menus ${document.querySelectorAll('.umk-slash-menu').length})`);
  m.editor.commands.insertContent('sep');
  await tick();
  assert.equal(document.querySelectorAll('.umk-slash-item').length, 1);
  m.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  assert.ok(m.surface.currentText().startsWith('***'), JSON.stringify(m.surface.currentText()));
});

test('slash does not open inside code', () => {
  document.querySelectorAll('.umk-slash-menu').forEach((e) => e.remove());
  const m = mount('```\n\n```\n');
  m.editor.commands.focus();
  sel(m.editor, 1);
  m.editor.commands.insertContent('/');
  assert.equal(document.querySelectorAll('.umk-slash-menu').length, 0);
});

// ------------------------------------------------------------- block gaps
test('arrow keys put the cursor in the gap between two code blocks, and typing there makes a paragraph', () => {
  const m = mount('```\na\n```\n\n```\nb\n```\n');
  sel(m.editor, 2); // end of "a"
  m.editor.view.someProp('handleKeyDown', (f) => f(m.editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight' })));
  assert.ok(m.editor.state.selection instanceof GapCursor, m.editor.state.selection.toString());
  assert.ok(m.editor.commands.createParagraphNear());
  m.editor.commands.insertContent('between');
  assert.equal(m.surface.currentText(), '```\na\n```\n\nbetween\n\n```\nb\n```\n');
});

test('the cursor can sit between two images, before the first block and after the last block', () => {
  const m = mount('![a](a.png)\n\n![b](b.png)\n');
  const d = m.editor.state.doc;
  for (const pos of [0, d.firstChild!.nodeSize]) {
    m.editor.view.dispatch(m.editor.state.tr.setSelection(new GapCursor(m.editor.state.doc.resolve(pos))));
    assert.ok(m.editor.state.selection instanceof GapCursor, `gap at ${pos}`);
  }
  // The page always ends with an empty line to type on
  const last = m.editor.state.doc.lastChild!;
  assert.equal(last.type.name, 'paragraph');
  assert.equal(last.content.size, 0);
});

test('arrow keys move into the gap between neighbouring blocks', () => {
  const m = mount('![a](a.png)\n\n![b](b.png)\n');
  m.editor.view.dispatch(m.editor.state.tr.setSelection(NodeSelection.create(m.editor.state.doc, 0)));
  m.editor.view.someProp('handleKeyDown', (f) => f(m.editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight' })));
  assert.ok(m.editor.state.selection instanceof GapCursor, m.editor.state.selection.toString());
});

test('Enter on an empty last line of a code block steps out of it', () => {
  const m = mount('```\ncode\n```\n');
  sel(m.editor, 5); // end of "code"
  m.editor.view.someProp('handleKeyDown', (f) => f(m.editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
  assert.equal(m.editor.state.doc.firstChild!.textContent, 'code\n');
  m.editor.view.someProp('handleKeyDown', (f) => f(m.editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
  assert.equal(m.editor.state.doc.firstChild!.textContent, 'code');
  assert.equal(m.editor.state.selection.$from.parent.type.name, 'paragraph');
  m.editor.commands.insertContent('after');
  assert.equal(m.surface.currentText(), '```\ncode\n```\n\nafter\n');
});

// --------------------------------------------------------------- list depth
test('lists cannot be nested deeper than three levels', () => {
  const m = mount('- a\n    - b\n        - c\n        - d\n');
  const before = m.surface.currentText();
  let at = 0;
  m.editor.state.doc.descendants((n, pos) => { if (n.isText && n.text === 'd') at = pos + 1; });
  sel(m.editor, at);
  m.editor.commands.sinkListItem('listItem'); // would make "d" a fourth level
  assert.equal(m.surface.currentText(), before);
  // one level up is fine
  sel(m.editor, at);
  m.editor.commands.liftListItem('listItem');
  assert.notEqual(m.surface.currentText(), before);
});

test('the language picker is part of every code block', () => {
  const m = mount('```ts\nx\n```\n');
  const select = m.root.querySelector('select.umk-codeblock-language') as HTMLSelectElement;
  assert.equal(select.value, 'ts');
  select.value = 'python';
  select.dispatchEvent(new Event('change'));
  assert.equal(m.surface.currentText(), '```python\nx\n```\n');
  assert.ok(m.root.querySelector('.hljs-keyword, .hljs-built_in, code'));
});
