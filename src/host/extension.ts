import * as vscode from 'vscode';
import { AssetService } from './assetService.ts';
import { UndermarkEditorProvider, VIEW_TYPE } from './editorProvider.ts';
import { ExportService } from './exportService.ts';
import { SettingsService } from './settingsService.ts';

export function activate(context: vscode.ExtensionContext): void {
  const settings = new SettingsService();
  const assets = new AssetService();
  const exporter = new ExportService();
  const exportCommand = (format: 'html' | 'pdf' | 'markdown') => (uri?: vscode.Uri, selected?: vscode.Uri[]) => exporter.run(format, uri, selected);
  context.subscriptions.push(
    settings,
    vscode.commands.registerCommand('undermark.exportHtml', exportCommand('html')),
    vscode.commands.registerCommand('undermark.exportPdf', exportCommand('pdf')),
    vscode.commands.registerCommand('undermark.exportMarkdown', exportCommand('markdown')),
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new UndermarkEditorProvider(context.extensionUri, settings, assets), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
  );
}

export function deactivate(): void {}
