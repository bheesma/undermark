import * as vscode from 'vscode';
import { isToHost, SETTING_NAMES } from '../shared/messages.ts';
import type { ToView } from '../shared/messages.ts';
import type { AssetService } from './assetService.ts';
import { DocumentSync } from './documentSync.ts';
import type { SettingsService } from './settingsService.ts';
import { clampSetting } from './settings.ts';

export type SessionWebview = Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage' | 'asWebviewUri'>;

/** Picture bytes arrive as an ArrayBuffer, a typed array, or (older hosts) a plain object of numbers. */
export function toBytes(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return Uint8Array.from(Object.values(data as object) as number[]);
}

/** One open editor: connects a document, a screen, and the shared services. */
export class EditorSession implements vscode.Disposable {
  private readonly sync: DocumentSync;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly document: vscode.TextDocument;
  private readonly webview: SessionWebview;
  private readonly settings: SettingsService;
  private readonly assets: AssetService;

  constructor(document: vscode.TextDocument, webview: SessionWebview, settings: SettingsService, assets: AssetService) {
    this.document = document;
    this.webview = webview;
    this.settings = settings;
    this.assets = assets;
    this.sync = new DocumentSync(document, (m) => this.post(m));
    this.disposables.push(
      this.sync,
      webview.onDidReceiveMessage((m) => void this.onMessage(m)),
      settings.onChange((s) => {
        for (const name of SETTING_NAMES) this.post({ type: 'settingChanged', name, value: s[name] });
      }),
    );
  }

  private post(message: ToView): void {
    void this.webview.postMessage(message);
  }

  private async onMessage(m: unknown): Promise<void> {
    if (!isToHost(m)) return;
    switch (m.type) {
      case 'ready':
        this.post({
          type: 'load',
          text: this.document.getText(),
          version: this.sync.nextVersion(),
          settings: this.settings.get(),
          assetBase: this.assets.resolveBase(this.webview, this.document.uri),
        });
        break;
      case 'edit':
        await this.sync.applyFromView(m.text);
        break;
      case 'saveImage': {
        const result = await this.assets.saveImage(this.document.uri, toBytes(m.data), m.name, m.mime);
        this.post({ type: 'imageSaved', id: m.id, ...result });
        break;
      }
      case 'settingChanged':
        await this.settings.set(m.name, clampSetting(m.name, m.value));
        break;
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
