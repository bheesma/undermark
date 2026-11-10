import * as vscode from 'vscode';
import type { ToView } from '../shared/messages.ts';
import { minimalEdit } from './diff.ts';

/**
 * Keeps the VS Code text document and the screen identical. The document is the single
 * source of truth: edits from the screen are written into it, document changes from anywhere
 * else (another tab, git, undo) are pushed to the screen, and the echo of our own write is
 * recognised and ignored so the cursor never jumps.
 */
export class DocumentSync implements vscode.Disposable {
  private version = 0;
  private echo: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly subscription: vscode.Disposable;
  private readonly document: vscode.TextDocument;
  private readonly post: (message: ToView) => void;

  constructor(document: vscode.TextDocument, post: (message: ToView) => void) {
    this.document = document;
    this.post = post;
    this.subscription = vscode.workspace.onDidChangeTextDocument((e) => this.onExternalChange(e));
  }

  nextVersion(): number {
    return ++this.version;
  }

  pushToView(): void {
    this.post({ type: 'externalChange', text: this.document.getText(), version: this.nextVersion() });
  }

  /** Writes the screen's text into the document. Edits are applied one at a time, in order. */
  applyFromView(text: string): Promise<boolean> {
    const run = () => this.write(text);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async write(text: string): Promise<boolean> {
    const eol = this.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const next = text.replace(/\r\n|\r|\n/g, eol);
    const edit = minimalEdit(this.document.getText(), next);
    if (!edit) return true;
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(
      this.document.uri,
      new vscode.Range(this.document.positionAt(edit.start), this.document.positionAt(edit.end)),
      edit.replacement,
    );
    this.echo = next;
    const ok = await vscode.workspace.applyEdit(workspaceEdit);
    if (!ok) this.echo = null;
    return ok;
  }

  onExternalChange(e: vscode.TextDocumentChangeEvent): void {
    if (e.document !== this.document || e.contentChanges.length === 0) return;
    if (this.echo !== null && this.document.getText() === this.echo) {
      this.echo = null; // our own write coming back
      return;
    }
    this.echo = null;
    this.pushToView();
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
