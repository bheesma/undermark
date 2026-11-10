/** Pure helpers for pictures stored beside a document (contract section 6.3). */

/** "notes.umk" keeps its pictures in "notes.assets". */
export function assetsFolderName(documentFileName: string): string {
  return documentFileName.replace(/\.[^.]*$/, '') + '.assets';
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
};

export function isSupportedImageMime(mime: string): boolean {
  return mime in EXTENSION_BY_MIME;
}

/** A safe file name: letters, digits, dot, dash and underscore only, with an extension that matches the type. */
export function safeFileName(suggested: string, mime: string, fallbackStem = 'image'): string {
  const ext = EXTENSION_BY_MIME[mime] ?? 'png';
  const base = suggested.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  return `${stem || fallbackStem}.${ext}`;
}

/** "image.png" becomes "image-2.png", "image-3.png"... until the name is free. */
export function uniqueName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!exists(candidate)) return candidate;
  }
}
