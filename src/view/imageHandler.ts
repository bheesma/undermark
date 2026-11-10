import type { SaveImageResult, Settings } from '../shared/messages.ts';

export type Confirm = (question: string) => Promise<boolean>;

/** What the host offers for pictures that must be stored beside the document. */
export interface ImageHost {
  saveImage(data: ArrayBuffer, name: string, mime: string): Promise<SaveImageResult>;
}

export interface ImageHandlerOptions {
  settings: () => Pick<Settings, 'imageStorage' | 'embedWarningKB'>;
  host?: ImageHost;
  confirm: Confirm;
  /** Puts a picture in the page. */
  insert: (src: string, alt: string) => boolean;
}

const MIME_OK = /^image\/(png|jpeg|gif|webp|svg\+xml|avif)$/;

export function imageFilesOf(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((f) => MIME_OK.test(f.type));
}

function toDataUri(bytes: ArrayBuffer, mime: string): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

/** ImageHandler: turns pasted or dropped picture files into pictures in the page. */
export class ImageHandler {
  private readonly options: ImageHandlerOptions;

  constructor(options: ImageHandlerOptions) {
    this.options = options;
  }

  async insertFromPaste(files: File[]): Promise<void> {
    for (const file of files) await this.insertOne(file);
  }

  private async insertOne(file: File): Promise<void> {
    const { imageStorage, embedWarningKB } = this.options.settings();
    const bytes = await file.arrayBuffer();
    const alt = file.name.replace(/\.[^.]*$/, '');
    const embed = async (): Promise<void> => {
      const kb = Math.round(bytes.byteLength / 1024);
      if (kb > embedWarningKB && !(await this.options.confirm(`This picture is ${kb} KB. Embedding it makes the file large. Insert anyway?`))) return;
      this.options.insert(toDataUri(bytes, file.type), alt);
    };

    if (imageStorage === 'embedded' || !this.options.host) return embed();

    const saved = await this.options.host.saveImage(bytes, file.name || 'image', file.type);
    if (saved.ok) {
      this.options.insert(saved.path, alt);
    } else if (await this.options.confirm(`The picture could not be saved beside the file (${saved.reason}). Embed it in the file instead?`)) {
      await embed();
    }
  }
}
