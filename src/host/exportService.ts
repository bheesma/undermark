import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';
import { parse } from '../core/index.ts';
import type { DocumentModel } from '../core/index.ts';
import { exportHtml, exportIndex } from '../export/html.ts';
import { exportMarkdown } from '../export/markdown.ts';
import { assetsFolderName, uniqueName } from './assets.ts';
import { browserCandidates, EXTENSION, isRemotePicture, mimeOfPicture, outputFolderName, outputRelativePath } from '../export/names.ts';
import type { ExportFormat } from '../export/names.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Job { root: vscode.Uri; files: vscode.Uri[] }

/**
 * ExportService: HTML, PDF and Markdown from one document or from every document in a folder.
 * Folder exports are mirrored under <folder>/export/<format>/. PDF is printed by an installed
 * Chromium-based browser, so nothing heavy ships with the extension.
 */
export class ExportService {
  async run(format: ExportFormat, uri?: vscode.Uri, selected?: vscode.Uri[]): Promise<void> {
    const targets = selected && selected.length > 0 ? selected : uri ? [uri] : await this.askTargets();
    if (!targets || targets.length === 0) return;
    try {
      const jobs = await this.jobsFor(targets);
      const count = jobs.reduce((n, j) => n + j.files.length, 0);
      if (count === 0) return void vscode.window.showInformationMessage('No Undermark (.umk) documents found to export.');
      if (count === 1 && targets.length === 1 && jobs[0]!.files[0]!.path === targets[0]!.path) return await this.exportOne(format, jobs[0]!.files[0]!);
      await this.exportMany(format, jobs);
    } catch (e) {
      void vscode.window.showErrorMessage(`Undermark export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---------------------------------------------------------------- choosing what to export
  private activeDocument(): vscode.Uri | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return input instanceof vscode.TabInputCustom && input.uri.path.endsWith('.umk') ? input.uri : undefined;
  }

  private async askTargets(): Promise<vscode.Uri[] | undefined> {
    const active = this.activeDocument();
    if (active) {
      const folder = vscode.Uri.joinPath(active, '..');
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'This document', uri: active },
          { label: 'Every document in this folder', description: folder.fsPath, uri: folder },
          { label: 'Choose a folder or document…', uri: undefined },
        ],
        { title: 'Export what?' },
      );
      if (!pick) return undefined;
      if (pick.uri) return [pick.uri];
    }
    return await vscode.window.showOpenDialog({
      canSelectFiles: true, canSelectFolders: true, canSelectMany: true, openLabel: 'Export',
      filters: { 'Undermark documents': ['umk'] }, title: 'Choose documents or folders to export',
    });
  }

  private async jobsFor(targets: vscode.Uri[]): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const t of targets) {
      const stat = await vscode.workspace.fs.stat(t);
      if (stat.type & vscode.FileType.Directory) {
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(t, '**/*.umk'), '**/{node_modules,.git,export}/**');
        jobs.push({ root: t, files: files.sort((a, b) => a.path.localeCompare(b.path)) });
      } else if (t.path.endsWith('.umk')) {
        jobs.push({ root: vscode.Uri.joinPath(t, '..'), files: [t] });
      }
    }
    return jobs;
  }

  // ------------------------------------------------------------------------- one document
  private async exportOne(format: ExportFormat, file: vscode.Uri): Promise<void> {
    const name = file.path.split('/').pop()!.replace(/\.umk$/i, '');
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(file, '..', `${name}.${EXTENSION[format]}`),
      filters: { [format.toUpperCase()]: [EXTENSION[format]] },
      saveLabel: 'Export',
    });
    if (!target) return;
    await this.render(format, file, target);
    this.done(`Exported ${target.path.split('/').pop()}`, target);
  }

  // ----------------------------------------------------------------------- many documents
  private async exportMany(format: ExportFormat, jobs: Job[]): Promise<void> {
    const failed: string[] = [];
    let written = 0;
    let firstOut: vscode.Uri | undefined;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Exporting ${format}` }, async (progress) => {
      const total = jobs.reduce((n, j) => n + j.files.length, 0);
      for (const job of jobs) {
        const out = vscode.Uri.joinPath(job.root, outputFolderName(format));
        firstOut ??= out;
        const made: { href: string; label: string }[] = [];
        for (const file of job.files) {
          const relative = file.path.slice(job.root.path.length).replace(/^\/+/, '');
          const outRelative = outputRelativePath(relative, format);
          progress.report({ message: relative, increment: 100 / total });
          try {
            await this.render(format, file, vscode.Uri.joinPath(out, outRelative));
            made.push({ href: outRelative, label: relative.replace(/\.umk$/i, '') });
            written++;
          } catch (e) {
            failed.push(`${relative}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (format === 'html' && made.length > 0 && job.files.length > 1) {
          const title = job.root.path.split('/').pop() || 'Documents';
          await this.write(vscode.Uri.joinPath(out, 'index.html'), exportIndex(title, made));
        }
      }
    });
    const summary = `Exported ${written} document${written === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''}`;
    if (failed.length) void vscode.window.showWarningMessage(`${summary}: ${failed.slice(0, 3).join('; ')}`);
    else if (firstOut) this.done(summary, firstOut);
  }

  private done(message: string, where: vscode.Uri): void {
    void vscode.window.showInformationMessage(message, 'Show').then((choice) => {
      if (choice) void vscode.commands.executeCommand('revealFileInOS', where);
    });
  }

  // ----------------------------------------------------------------------------- rendering
  private async readModel(file: vscode.Uri): Promise<DocumentModel> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === file.toString());
    const text = open ? open.getText() : dec.decode(await vscode.workspace.fs.readFile(file));
    return parse(text).model;
  }

  private async write(target: vscode.Uri, text: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, '..'));
    await vscode.workspace.fs.writeFile(target, enc.encode(text));
  }

  private async render(format: ExportFormat, file: vscode.Uri, target: vscode.Uri): Promise<void> {
    const model = await this.readModel(file);
    const title = file.path.split('/').pop()!.replace(/\.umk$/i, '');
    if (format === 'markdown') return await this.write(target, exportMarkdown(model, { resolveImage: await this.markdownPictures(model, file, target) }));
    const resolveImage = await this.embeddedPictures(model, file);
    if (format === 'html') return await this.write(target, exportHtml(model, { title, resolveImage }));
    await this.printPdf(exportHtml(model, { title, resolveImage, print: true }), target);
  }

  private pictureSources(model: DocumentModel): string[] {
    const found = new Set<string>();
    const visit = (blocks: DocumentModel['blocks']) => { for (const b of blocks) if (b.kind === 'image' && !isRemotePicture(b.src)) found.add(b.src); };
    visit(model.blocks);
    return [...found];
  }

  private pictureUri(src: string, file: vscode.Uri): vscode.Uri {
    let path = src;
    try { path = decodeURIComponent(src); } catch { /* not percent-encoded */ }
    return src.startsWith('/') ? vscode.Uri.file(path) : vscode.Uri.joinPath(file, '..', path);
  }

  /** HTML and PDF carry their pictures inside the page, so the file can be moved anywhere. */
  private async embeddedPictures(model: DocumentModel, file: vscode.Uri): Promise<(src: string) => string> {
    const map = new Map<string, string>();
    for (const src of this.pictureSources(model)) {
      const mime = mimeOfPicture(src);
      if (!mime) continue;
      try {
        const bytes = await vscode.workspace.fs.readFile(this.pictureUri(src, file));
        map.set(src, `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`);
      } catch { /* a missing picture keeps its address */ }
    }
    return (src) => map.get(src) ?? src;
  }

  /** Markdown keeps pictures as files: copied beside the output unless it sits next to the document. */
  private async markdownPictures(model: DocumentModel, file: vscode.Uri, target: vscode.Uri): Promise<(src: string) => string> {
    const sameFolder = vscode.Uri.joinPath(file, '..').toString() === vscode.Uri.joinPath(target, '..').toString();
    const map = new Map<string, string>();
    if (!sameFolder) {
      const folder = assetsFolderName(target.path.split('/').pop()!);
      const taken = new Set<string>();
      for (const src of this.pictureSources(model)) {
        try {
          const bytes = await vscode.workspace.fs.readFile(this.pictureUri(src, file));
          const name = uniqueName(src.split('/').pop()!, (n) => taken.has(n));
          taken.add(name);
          await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, '..', folder));
          await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(target, '..', folder, name), bytes);
          map.set(src, `${encodeURIComponent(folder)}/${encodeURIComponent(name)}`);
        } catch { /* a missing picture keeps its address */ }
      }
    }
    return (src) => map.get(src) ?? src;
  }

  // ---------------------------------------------------------------------------------- PDF
  private async findBrowser(): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('undermark').get<string>('pdfBrowserPath', '').trim();
    for (const candidate of configured ? [configured] : browserCandidates(process.platform, process.env)) {
      try { await access(candidate); return candidate; } catch { /* try the next */ }
    }
    return undefined;
  }

  private async printPdf(html: string, target: vscode.Uri): Promise<void> {
    const browser = await this.findBrowser();
    if (!browser) {
      throw new Error('PDF export needs Google Chrome, Microsoft Edge or Chromium. Install one, or set undermark.pdfBrowserPath. HTML and Markdown export work without it.');
    }
    const scratch = await mkdtemp(join(tmpdir(), 'undermark-'));
    try {
      const page = join(scratch, 'page.html');
      await writeFile(page, html);
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, '..'));
      const out = join(scratch, 'page.pdf');
      await new Promise<void>((resolve, reject) => {
        execFile(browser, ['--headless=new', '--disable-gpu', `--user-data-dir=${join(scratch, 'profile')}`, '--no-pdf-header-footer', `--print-to-pdf=${out}`, pathToFileURL(page).href],
          { timeout: 60_000 }, (err) => (err ? reject(new Error(`the browser could not print the page (${err.message.split('\n')[0]})`)) : resolve()));
      });
      await vscode.workspace.fs.writeFile(target, await readFile(out));
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
}
