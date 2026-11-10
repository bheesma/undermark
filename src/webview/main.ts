import { EditorShell } from '../view/index.ts';
import type { ImageHost } from '../view/index.ts';
import { setAssetBase } from '../view/imageNode.ts';
import type { SaveImageResult, ToHost, ToView } from '../shared/messages.ts';

declare function acquireVsCodeApi(): { postMessage(message: ToHost): void };
const vscode = acquireVsCodeApi();

let shell: EditorShell | null = null;
let version = 0;
let nextImageId = 1;
const pendingImages = new Map<number, (r: SaveImageResult) => void>();

const images: ImageHost = {
  saveImage: (data, name, mime) =>
    new Promise((resolve) => {
      const id = nextImageId++;
      pendingImages.set(id, resolve);
      vscode.postMessage({ type: 'saveImage', id, data, name, mime });
    }),
};

window.addEventListener('message', (event: MessageEvent<ToView>) => {
  const m = event.data;
  switch (m.type) {
    case 'load':
      setAssetBase(m.assetBase);
      shell = new EditorShell({
        root: document.getElementById('root')!,
        text: m.text,
        images,
        externalHistory: true,
        settings: m.settings,
        onSpacing: (value) => vscode.postMessage({ type: 'settingChanged', name: 'lineSpacing', value }),
        onEdit: (text) => vscode.postMessage({ type: 'edit', text, version: ++version }),
      });
      break;
    case 'externalChange':
      shell?.surface.load(m.text);
      break;
    case 'imageSaved': {
      const done = pendingImages.get(m.id);
      pendingImages.delete(m.id);
      done?.(m.ok ? { ok: true, path: m.path } : { ok: false, reason: m.reason });
      break;
    }
    case 'settingChanged':
      shell?.surface.applySettings({ [m.name]: m.value });
      shell?.toolbar.syncSpacing();
      break;
  }
});

vscode.postMessage({ type: 'ready' });
