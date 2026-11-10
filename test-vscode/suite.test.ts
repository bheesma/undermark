import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { AssetService } from '../src/host/assetService.ts';
import { ExportService } from '../src/host/exportService.ts';
import { EditorSession } from '../src/host/editorSession.ts';
import { SettingsService } from '../src/host/settingsService.ts';
import type { ToHost, ToView } from '../src/shared/messages.ts';

/** A stand-in for the screen: records what the host sends and lets the test send messages back. */
class FakeWebview {
  readonly sent: ToView[] = [];
  private readonly emitter = new vscode.EventEmitter<unknown>();
  readonly onDidReceiveMessage = this.emitter.event;
  postMessage(m: ToView): Thenable<boolean> {
    this.sent.push(m);
    return Promise.resolve(true);
  }
  asWebviewUri(u: vscode.Uri): vscode.Uri {
    return u;
  }
  send(m: ToHost): void {
    this.emitter.fire(m);
  }
  of<T extends ToView['type']>(type: T): Extract<ToView, { type: T }>[] {
    return this.sent.filter((m): m is Extract<ToView, { type: T }> => m.type === type);
  }
}

async function until(cond: () => boolean, what: string, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 150));

suite('Undermark inside VS Code', () => {
  let dir: string;
  const settings = new SettingsService();
  const assets = new AssetService();
  const disposables: vscode.Disposable[] = [];

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umk-'));
  });
  teardown(async () => {
    disposables.splice(0).forEach((d) => d.dispose());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.chmodSync(dir, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  suiteTeardown(() => settings.dispose());

  async function open(name: string, content: string) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const webview = new FakeWebview();
    const session = new EditorSession(document, webview, settings, assets);
    disposables.push(session);
    webview.send({ type: 'ready' });
    await until(() => webview.of('load').length === 1, 'load');
    return { document, webview, file };
  }

  test('the extension registers the editor for .umk files', async () => {
    const file = path.join(dir, 'real.umk');
    fs.writeFileSync(file, 'Hello\n=====\n');
    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(file), 'undermark.editor');
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom, 'opened as a custom editor');
    assert.equal((input as vscode.TabInputCustom).viewType, 'undermark.editor');
    assert.equal(vscode.extensions.all.find((e) => e.packageJSON.name === 'undermark')?.packageJSON.contributes.customEditors[0].selector[0].filenamePattern, '*.umk');
  });

  test('opening sends the file text, settings and picture base; the file is not changed', async () => {
    const original = 'not   canonical\r\nat all\r\n';
    const { webview, document, file } = await open('open.umk', original);
    const load = webview.of('load')[0]!;
    assert.equal(load.text, original);
    assert.equal(load.settings.lineSpacing, 1.8);
    assert.ok(load.assetBase.endsWith('/'));
    assert.equal(document.isDirty, false);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  });

  test('edits from the screen reach the document without echoing back', async () => {
    const { webview, document } = await open('edit.umk', 'one\n');
    webview.send({ type: 'edit', text: 'one\n\ntwo\n', version: 1 });
    await until(() => document.getText() === 'one\n\ntwo\n', 'document edit');
    await settle();
    assert.equal(document.isDirty, true);
    assert.equal(webview.of('externalChange').length, 0, 'no echo to the screen');
    webview.send({ type: 'edit', text: 'one\n\ntwo\n\nthree\n', version: 2 });
    webview.send({ type: 'edit', text: 'one\n\ntwo\n\nthree\n\nfour\n', version: 3 });
    await until(() => document.getText().endsWith('four\n'), 'queued edits');
    await settle();
    assert.equal(webview.of('externalChange').length, 0);
  });

  test('a document that uses Windows line endings keeps them', async () => {
    const { webview, document } = await open('crlf.umk', 'a\r\n\r\nb\r\n');
    webview.send({ type: 'edit', text: 'a\n\nb\n\nc\n', version: 1 });
    await until(() => document.getText().includes('c'), 'edit');
    assert.equal(document.getText(), 'a\r\n\r\nb\r\n\r\nc\r\n');
  });

  test('changes made elsewhere are pushed to the screen', async () => {
    const { webview, document } = await open('outside.umk', 'start\n');
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 5), ' + outside');
    await vscode.workspace.applyEdit(edit);
    await until(() => webview.of('externalChange').length === 1, 'externalChange');
    assert.equal(webview.of('externalChange')[0]!.text, 'start + outside\n');
  });

  test('VS Code undo and redo flow to the screen; save writes the file', async () => {
    const { webview, document, file } = await open('undo.umk', 'base\n');
    // the plain text editor, so undo does not depend on a real screen being focused
    await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
    webview.send({ type: 'edit', text: 'base\n\nadded\n', version: 1 });
    await until(() => document.getText() === 'base\n\nadded\n', 'edit');
    await settle();

    await vscode.commands.executeCommand('undo');
    
    await until(() => document.getText() === 'base\n', 'undo');
    await until(() => webview.of('externalChange').length === 1, 'undo pushed');
    assert.equal(webview.of('externalChange')[0]!.text, 'base\n');

    await vscode.commands.executeCommand('redo');
    await until(() => document.getText() === 'base\n\nadded\n', 'redo');
    await until(() => webview.of('externalChange').length === 2, 'redo pushed');
    assert.equal(webview.of('externalChange')[1]!.text, 'base\n\nadded\n');

    assert.equal(await document.save(), true);
    assert.equal(fs.readFileSync(file, 'utf8'), 'base\n\nadded\n');
    assert.equal(document.isDirty, false);
  });

  test('a pasted picture is saved in <name>.assets beside the document; names stay unique', async () => {
    const { webview } = await open('my notes.umk', 'x\n');
    const send = (id: number) => webview.send({ type: 'saveImage', id, data: new Uint8Array([1, 2, 3]).buffer, name: 'Screen Shot.png', mime: 'image/png' });
    send(1);
    send(2);
    await until(() => webview.of('imageSaved').length === 2, 'imageSaved');
    const [a, b] = webview.of('imageSaved');
    assert.deepEqual([a!.ok && a!.path, b!.ok && b!.path].sort(), ['my notes.assets/Screen-Shot-2.png', 'my notes.assets/Screen-Shot.png']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'my notes.assets')).sort(), ['Screen-Shot-2.png', 'Screen-Shot.png']);
    assert.deepEqual([...fs.readFileSync(path.join(dir, 'my notes.assets', 'Screen-Shot.png'))], [1, 2, 3]);
  });

  test('a picture that cannot be saved reports why, and nothing is half-written', async () => {
    const { webview } = await open('ro.umk', 'x\n');
    fs.chmodSync(dir, 0o555);
    webview.send({ type: 'saveImage', id: 7, data: new Uint8Array([1]).buffer, name: 'a.png', mime: 'image/png' });
    webview.send({ type: 'saveImage', id: 8, data: new Uint8Array([1]).buffer, name: 'a.html', mime: 'text/html' });
    await until(() => webview.of('imageSaved').length === 2, 'imageSaved');
    const results = webview.of('imageSaved');
    assert.equal(results.find((r) => r.id === 8)!.ok, false, 'not a picture');
    if (process.getuid?.() !== 0) {
      assert.equal(results.find((r) => r.id === 7)!.ok, false, 'read-only folder');
      assert.equal(fs.existsSync(path.join(dir, 'ro.assets')), false);
    }
  });

  test('settings are shared, clamped and announced; changes from the screen are stored', async () => {
    const { webview } = await open('settings.umk', 'x\n');
    const config = vscode.workspace.getConfiguration('undermark');
    try {
      webview.send({ type: 'settingChanged', name: 'lineSpacing', value: 99 });
      await until(() => webview.of('settingChanged').some((m) => m.name === 'lineSpacing' && m.value === 2.5), 'announcement');
      assert.equal(settings.get().lineSpacing, 2.5);
      await config.update('embedWarningKB', 1, vscode.ConfigurationTarget.Global);
      assert.equal(settings.get().embedWarningKB, 50);
    } finally {
      for (const key of ['lineSpacing', 'embedWarningKB']) await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test('messages with the wrong shape are ignored', async () => {
    const { webview, document } = await open('bad.umk', 'safe\n');
    (webview as unknown as { send(m: unknown): void }).send({ type: 'edit', text: 42 });
    (webview as unknown as { send(m: unknown): void }).send({ type: 'unknown' });
    (webview as unknown as { send(m: unknown): void }).send('hello');
    await settle();
    assert.equal(document.getText(), 'safe\n');
  });

  test('a folder exports to HTML, Markdown and PDF, pictures included', async function () {
    this.timeout(60000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umk-export-'));
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.mkdirSync(path.join(dir, 'a.assets'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(path.join(dir, 'a.assets', 'p.png'), png);
    fs.writeFileSync(path.join(dir, 'a.umk'), 'Alpha\n=====\n\nHello **world**\n\n![p](a.assets/p.png)\n');
    fs.writeFileSync(path.join(dir, 'sub', 'b.umk'), '# Beta\n\n- one\n- two\n');
    const folder = vscode.Uri.file(dir);
    const service = new ExportService();

    await service.run('html', folder);
    const html = fs.readFileSync(path.join(dir, 'export', 'html', 'a.html'), 'utf8');
    assert.match(html, /<h1>Alpha<\/h1>/);
    assert.match(html, /src="data:image\/png;base64,/, 'the picture travels inside the page');
    assert.match(fs.readFileSync(path.join(dir, 'export', 'html', 'index.html'), 'utf8'), /sub\/b\.html/);

    await service.run('markdown', folder);
    assert.equal(fs.readFileSync(path.join(dir, 'export', 'markdown', 'sub', 'b.md'), 'utf8'), '### Beta\n\n- one\n- two\n');
    assert.match(fs.readFileSync(path.join(dir, 'export', 'markdown', 'a.md'), 'utf8'), /!\[p\]\(a\.assets\/p\.png\)/);
    assert.ok(fs.existsSync(path.join(dir, 'export', 'markdown', 'a.assets', 'p.png')), 'the picture is copied beside the Markdown');

    await service.run('html', folder); // the export folder is never read back as a source
    assert.equal(fs.readdirSync(path.join(dir, 'export', 'html')).filter((f) => f.endsWith('.html')).length, 2 + 0, 'a.html and index.html only');

    if (fs.existsSync('/Applications/Google Chrome.app')) {
      await service.run('pdf', folder);
      assert.equal(fs.readFileSync(path.join(dir, 'export', 'pdf', 'a.pdf')).subarray(0, 4).toString(), '%PDF');
    }
  });
});
