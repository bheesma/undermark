import * as vscode from 'vscode';
import type { SaveImageResult } from '../shared/messages.ts';
import { assetsFolderName, isSupportedImageMime, safeFileName, uniqueName } from './assets.ts';

const dirOf = (uri: vscode.Uri) => vscode.Uri.joinPath(uri, '..');
const baseName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf('/') + 1);

/** Saves pasted pictures beside the document and makes stored paths loadable by the screen. */
export class AssetService {
  private queue: Promise<unknown> = Promise.resolve();

  /** Saves run one at a time, so two pictures never pick the same free name. */
  saveImage(document: vscode.Uri, data: Uint8Array, suggestedName: string, mime: string): Promise<SaveImageResult> {
    const run = () => this.save(document, data, suggestedName, mime);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async save(document: vscode.Uri, data: Uint8Array, suggestedName: string, mime: string): Promise<SaveImageResult> {
    if (!isSupportedImageMime(mime)) return { ok: false, reason: `Pictures of type ${mime || 'unknown'} are not supported` };
    try {
      const folderName = assetsFolderName(baseName(document));
      const folder = vscode.Uri.joinPath(dirOf(document), folderName);
      await vscode.workspace.fs.createDirectory(folder);
      const taken = new Set((await vscode.workspace.fs.readDirectory(folder)).map(([name]) => name));
      const name = uniqueName(safeFileName(suggestedName, mime), (n) => taken.has(n));
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, name), data);
      return { ok: true, path: `${folderName}/${name}` };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** The address the screen prefixes to relative picture paths (the document's own folder). */
  resolveBase(webview: Pick<vscode.Webview, 'asWebviewUri'>, document: vscode.Uri): string {
    return webview.asWebviewUri(dirOf(document)).toString() + '/';
  }

  /** Folders the screen may load pictures from: the document's folder and the workspace. */
  localRoots(document: vscode.Uri): vscode.Uri[] {
    return [dirOf(document), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)];
  }
}
