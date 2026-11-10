/** Pure naming rules for exports. */

export type ExportFormat = 'html' | 'pdf' | 'markdown';

export const EXTENSION: Record<ExportFormat, string> = { html: 'html', pdf: 'pdf', markdown: 'md' };

/** "notes/day1.umk" becomes "notes/day1.html". */
export function outputRelativePath(relative: string, format: ExportFormat): string {
  return relative.replace(/\.umk$/i, '') + '.' + EXTENSION[format];
}

/** Where a folder export goes, inside the exported folder (never read back, as it holds no .umk files). */
export function outputFolderName(format: ExportFormat): string {
  return `export/${format}`;
}

export function mimeOfPicture(name: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext ? { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' }[ext] : undefined;
}

/** True for pictures that are not files on disk: web addresses and embedded data. */
export function isRemotePicture(src: string): boolean {
  return /^(https?:|data:)/i.test(src);
}

/** Where to look for a browser able to print a page to PDF, best first. */
export function browserCandidates(platform: string, env: Record<string, string | undefined>): string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((r): r is string => !!r);
    return roots.flatMap((r) => [`${r}\\Google\\Chrome\\Application\\chrome.exe`, `${r}\\Microsoft\\Edge\\Application\\msedge.exe`]);
  }
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']
    .flatMap((n) => ['/usr/bin/', '/usr/local/bin/', '/snap/bin/'].map((d) => d + n));
}
