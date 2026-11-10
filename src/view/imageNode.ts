import { mergeAttributes, Node } from '@tiptap/core';

/** Web addresses, relative paths and embedded pictures only (no file:, javascript:, etc.). */
export function isAllowedImageSrc(src: string | null): src is string {
  if (!src) return false;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif);/i.test(src)) return true;
  return /^(https?:\/\/|[^:]*$)/i.test(src);
}

let assetBase = '';

/** Set by the host: the address of the document's folder, where relative picture paths start. */
export function setAssetBase(base: string): void {
  assetBase = base;
}

/** The address the screen loads for a stored picture path. The file keeps the original path. */
export function resolveImageSrc(src: string): string {
  if (!assetBase || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return src;
  return assetBase + src.split('/').map((part) => encodeURIComponent(part)).join('/');
}

export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: '' }, alt: { default: '' } };
  },
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const src = (el as HTMLElement).getAttribute('src');
          return isAllowedImageSrc(src) ? { src, alt: (el as HTMLElement).getAttribute('alt') ?? '' } : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'umk-image';
      const show = (n: typeof node) => {
        const img = document.createElement('img');
        img.src = resolveImageSrc(n.attrs.src);
        img.alt = n.attrs.alt;
        img.addEventListener('error', () => {
          const ph = document.createElement('span');
          ph.className = 'umk-image-missing';
          ph.textContent = `Picture not available: ${n.attrs.alt || '(no description)'} · ${n.attrs.src}`;
          dom.replaceChildren(ph);
        });
        dom.replaceChildren(img);
      };
      show(node);
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          if (next.attrs.src !== node.attrs.src || next.attrs.alt !== node.attrs.alt) show(next);
          node = next;
          return true;
        },
      };
    };
  },
});
