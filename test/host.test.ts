import './helpers/dom.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTextEdit, minimalEdit } from '../src/host/diff.ts';
import { assetsFolderName, isSupportedImageMime, safeFileName, uniqueName } from '../src/host/assets.ts';
import { clampSetting, clampSettings, DEFAULTS } from '../src/host/settings.ts';
import { isToHost } from '../src/shared/messages.ts';
import { ImageHandler } from '../src/view/imageHandler.ts';
import { resolveImageSrc, setAssetBase } from '../src/view/imageNode.ts';
import { EditorShell } from '../src/view/index.ts';
import { TextSelection } from '@tiptap/pm/state';

// ------------------------------------------------------------------ settings
test('settings are clamped silently to the allowed range', () => {
  assert.deepEqual(clampSettings({}), DEFAULTS);
  assert.equal(clampSetting('lineSpacing', 0.2), 1);
  assert.equal(clampSetting('lineSpacing', 9), 2.5);
  assert.equal(clampSetting('lineSpacing', '1.8'), 1.8, 'wrong type falls back to the default');
  assert.equal(clampSetting('lineSpacing', 1.234), 1.23);
  assert.equal(clampSetting('embedWarningKB', 1), 50);
  assert.equal(clampSetting('embedWarningKB', 99999), 5000);
  assert.equal(clampSetting('imageStorage', 'nonsense'), 'assetsFolder');
  assert.equal(clampSetting('imageStorage', 'embedded'), 'embedded');
});

// -------------------------------------------------------------------- assets
test('pictures go to a folder named after the document, with safe unique names', () => {
  assert.equal(assetsFolderName('notes.umk'), 'notes.assets');
  assert.equal(assetsFolderName('my notes.v2.umk'), 'my notes.v2.assets');
  assert.equal(safeFileName('Screen Shot 2026 (1).PNG', 'image/png'), 'Screen-Shot-2026-1.png');
  assert.equal(safeFileName('../../etc/passwd', 'image/jpeg'), 'passwd.jpg');
  assert.equal(safeFileName('', 'image/webp'), 'image.webp');
  assert.equal(safeFileName('a.exe', 'image/gif'), 'a.gif');
  assert.ok(isSupportedImageMime('image/svg+xml') && !isSupportedImageMime('text/html'));
  const taken = new Set(['image.png', 'image-2.png']);
  assert.equal(uniqueName('image.png', (n) => taken.has(n)), 'image-3.png');
  assert.equal(uniqueName('fresh.png', (n) => taken.has(n)), 'fresh.png');
});

// ---------------------------------------------------------------------- diff
test('minimal edits reproduce the new text, including emoji and line endings', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const alphabet = ['a', 'b', '\n', '\r\n', ' ', '😀', '𝒳', 'é', '*'];
  const make = () => Array.from({ length: Math.floor(rnd() * 12) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
  for (let n = 0; n < 5000; n++) {
    const from = make();
    const cp = Array.from(from);
    const to = rnd() < 0.5 ? make() : cp.slice(0, 3).join('') + make() + cp.slice(-3).join('');
    const edit = minimalEdit(from, to);
    if (from === to) { assert.equal(edit, null); continue; }
    assert.equal(applyTextEdit(from, edit!), to, JSON.stringify({ from, to, edit }));
    const piece = (s: string) => s.length === 0 || !/[\udc00-\udfff]/.test(s[0]!) && !/[\ud800-\udbff]/.test(s[s.length - 1]!);
    assert.ok(piece(edit!.replacement) && piece(from.slice(edit!.start, edit!.end)), `split surrogate: ${JSON.stringify({ from, to, edit })}`);
  }
  assert.deepEqual(minimalEdit('hello world', 'hello brave world'), { start: 6, end: 6, replacement: 'brave ' });
});

// ------------------------------------------------------------------ messages
test('messages from the screen are validated before use', () => {
  assert.ok(isToHost({ type: 'ready' }));
  assert.ok(isToHost({ type: 'edit', text: 'x', version: 1 }));
  assert.ok(isToHost({ type: 'settingChanged', name: 'lineSpacing', value: 2 }));
  assert.ok(!isToHost({ type: 'edit', text: 5, version: 1 }));
  assert.ok(!isToHost({ type: 'settingChanged', name: 'constructor', value: 2 }));
  assert.ok(!isToHost({ type: 'saveImage', id: 1, name: 'a', mime: 'image/png' }));
  assert.ok(!isToHost({ type: 'other' }) && !isToHost(null) && !isToHost('edit'));
});

// -------------------------------------------------------------------- images
test('stored picture paths are resolved against the document folder; the file keeps the original path', () => {
  setAssetBase('');
  assert.equal(resolveImageSrc('notes.assets/a.png'), 'notes.assets/a.png');
  setAssetBase('https://file+.vscode-resource.test/dir/');
  assert.equal(resolveImageSrc('my notes.assets/a b.png'), 'https://file+.vscode-resource.test/dir/my%20notes.assets/a%20b.png');
  assert.equal(resolveImageSrc('https://x.org/a.png'), 'https://x.org/a.png');
  assert.equal(resolveImageSrc('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  setAssetBase('');
});

const png = (kb = 1) => new File([new Uint8Array(kb * 1024).fill(7)], 'My Shot.png', { type: 'image/png' });

function handler(over: Partial<ConstructorParameters<typeof ImageHandler>[0]> = {}) {
  const inserted: [string, string][] = [];
  const questions: string[] = [];
  const h = new ImageHandler({
    settings: () => ({ imageStorage: 'assetsFolder', embedWarningKB: 5 }),
    host: { saveImage: async (_d, name) => ({ ok: true, path: `notes.assets/${name}` }) },
    confirm: async (q) => (questions.push(q), true),
    insert: (src, alt) => (inserted.push([src, alt]), true),
    ...over,
  });
  return { h, inserted, questions };
}

test('a pasted picture is saved beside the document and referenced by relative path', async () => {
  const { h, inserted } = handler();
  await h.insertFromPaste([png()]);
  assert.deepEqual(inserted, [['notes.assets/My Shot.png', 'My Shot']]);
});

test('if saving beside the file fails, embedding is offered; declining leaves the document untouched', async () => {
  const host = { saveImage: async () => ({ ok: false as const, reason: 'read-only folder' }) };
  const yes = handler({ host });
  await yes.h.insertFromPaste([png()]);
  assert.match(yes.questions[0]!, /read-only folder/);
  assert.match(yes.inserted[0]![0], /^data:image\/png;base64,/);
  const no = handler({ host, confirm: async () => false });
  await no.h.insertFromPaste([png()]);
  assert.deepEqual(no.inserted, []);
});

test('embedding a picture above the warning size asks first', async () => {
  const embedded = { settings: () => ({ imageStorage: 'embedded' as const, embedWarningKB: 5 }) };
  const small = handler(embedded);
  await small.h.insertFromPaste([png(1)]);
  assert.equal(small.questions.length, 0);
  assert.equal(small.inserted.length, 1);
  const big = handler({ ...embedded, confirm: async () => false });
  await big.h.insertFromPaste([png(10)]);
  assert.deepEqual(big.inserted, []);
  const bigYes = handler(embedded);
  await bigYes.h.insertFromPaste([png(10)]);
  assert.match(bigYes.questions[0]!, /10 KB/);
  assert.equal(bigYes.inserted.length, 1);
});

// ------------------------------------------------------------- view wiring
function mount(text: string, extra: Partial<ConstructorParameters<typeof EditorShell>[0]> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  return new EditorShell({ root, text, ask: async () => null, ...extra });
}

test('pasting a picture file saves it through the host and inserts it; a picture with text is left to the text paste', async () => {
  const saved: string[] = [];
  const shell = mount('', { images: { saveImage: async (_d, name) => (saved.push(name), { ok: true, path: `x.assets/${name}` }) } });
  const view = shell.surface.editor.view;
  const paste = (files: File[], text: string) =>
    view.someProp('handlePaste', (f) => f(view, { clipboardData: { files, getData: (t: string) => (t === 'text/plain' ? text : '') } } as never, null as never));
  assert.equal(paste([png()], 'some words'), undefined, 'text present: not handled as a picture');
  assert.equal(paste([png()], ''), true);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(saved, ['My Shot.png']);
  assert.ok(shell.surface.currentText().includes('![My Shot](x.assets/My\\ Shot.png)'), shell.surface.currentText());
});

test('inside VS Code the page does not keep its own undo history', () => {
  const shell = mount('a\n', { externalHistory: true });
  assert.ok(!shell.surface.editor.extensionManager.extensions.some((e) => e.name === 'undoRedo'));
  assert.ok(mount('a\n').surface.editor.extensionManager.extensions.some((e) => e.name === 'undoRedo'));
});

test('settings from the host change line spacing', async () => {
  const shell = mount('word\n', { settings: { lineSpacing: 2 } });
  assert.equal(document.documentElement.style.getPropertyValue('--umk-line-height'), '2');
});

test('a change from outside keeps the cursor at the nearest valid place', () => {
  const shell = mount('hello world\n');
  const ed = shell.surface.editor;
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 8)));
  shell.surface.load('hello\n');
  assert.equal(ed.state.selection.from <= ed.state.doc.content.size, true);
  assert.ok(ed.state.selection.from >= 1);
  shell.surface.load('hello world, and more text\n');
  assert.equal(shell.surface.currentText(), 'hello world, and more text\n');
});

test('a plain click on a link does not open it; Ctrl or Cmd click does', () => {
  const shell = mount('[a](https://x.org)\n');
  const a = shell.surface.editor.view.dom.querySelector('a')!;
  const plain = new MouseEvent('click', { bubbles: true, cancelable: true });
  let reached = false;
  document.body.addEventListener('click', () => (reached = true), { once: true });
  a.dispatchEvent(plain);
  assert.equal(plain.defaultPrevented, true);
  assert.equal(reached, false);
  const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  document.body.addEventListener('click', () => (reached = true), { once: true });
  a.dispatchEvent(ctrl);
  assert.equal(ctrl.defaultPrevented, false);
  assert.equal(reached, true);
});

test('banner appears for unsupported lines and hides for clean text', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const shell = new EditorShell({ root, text: '> quoted\n\nplain\n', ask: async () => null });
  const banner = root.querySelector('.umk-banner') as HTMLElement;
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent ?? '', /1 line shown as plain text/);
  shell.surface.load('plain\n');
  assert.equal(banner.hidden, true);
});

test('spacing slider applies live and reports once on release', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const sent: number[] = [];
  const shell = new EditorShell({ root, text: 'a\n', ask: async () => null, onSpacing: (v) => sent.push(v) });
  const input = root.querySelector('.umk-spacing input') as HTMLInputElement;
  input.value = '2';
  input.dispatchEvent(new Event('input'));
  assert.equal(shell.surface.settings.lineSpacing, 2);
  assert.deepEqual(sent, []);
  input.dispatchEvent(new Event('change'));
  assert.deepEqual(sent, [2]);
});
