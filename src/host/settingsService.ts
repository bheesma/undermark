import * as vscode from 'vscode';
import type { Settings } from '../shared/messages.ts';
import { clampSetting, clampSettings } from './settings.ts';

const SECTION = 'undermark';

/** Reads and updates the user settings and announces changes. */
export class SettingsService implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Settings>();
  private readonly subscription: vscode.Disposable;
  readonly onChange = this.emitter.event;

  constructor() {
    this.subscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) this.emitter.fire(this.get());
    });
  }

  get(): Settings {
    const c = vscode.workspace.getConfiguration(SECTION);
    return clampSettings({
      lineSpacing: c.get('lineSpacing'),
      imageStorage: c.get('imageStorage'),
      embedWarningKB: c.get('embedWarningKB'),
    });
  }

  async set<K extends keyof Settings>(name: K, value: unknown): Promise<void> {
    await vscode.workspace.getConfiguration(SECTION).update(name, clampSetting(name, value), vscode.ConfigurationTarget.Global);
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
