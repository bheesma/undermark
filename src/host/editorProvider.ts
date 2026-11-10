import * as vscode from 'vscode';
import type { AssetService } from './assetService.ts';
import { EditorSession } from './editorSession.ts';
import type { SettingsService } from './settingsService.ts';

export const VIEW_TYPE = 'undermark.editor';

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Opens `.umk` files in the visual editor. VS Code keeps owning the file (save, undo, backup, git). */
export class UndermarkEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly extensionUri: vscode.Uri;
  private readonly settings: SettingsService;
  private readonly assets: AssetService;

  constructor(extensionUri: vscode.Uri, settings: SettingsService, assets: AssetService) {
    this.extensionUri = extensionUri;
    this.settings = settings;
    this.assets = assets;
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    if (document.getText().includes('\u0000')) {
      void vscode.window.showWarningMessage('This file is not readable text, so it is opened in the plain text editor.');
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      panel.dispose();
      return;
    }
    const webview = panel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'), ...this.assets.localRoots(document.uri)],
    };
    webview.html = this.html(webview);
    const session = new EditorSession(document, webview, this.settings, this.assets);
    panel.onDidDispose(() => session.dispose());
  }

  private html(webview: vscode.Webview): string {
    const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', name));
    const n = nonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${n}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${asset('editor.css')}">
<title>Undermark</title>
</head>
<body>
<div id="root"></div>
<script nonce="${n}" src="${asset('main.js')}"></script>
</body>
</html>`;
  }
}
