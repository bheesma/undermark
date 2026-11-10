// Must be imported before any editor code: gives Node a browser-like global scope.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window as unknown as Record<string, unknown> & typeof globalThis;

for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment', 'MutationObserver',
  'DOMParser', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'Event', 'KeyboardEvent', 'MouseEvent', 'HTMLInputElement', 'HTMLSelectElement', 'XMLSerializer']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? w : w[key], configurable: true, writable: true });
}

// jsdom has no layout; ProseMirror asks for rectangles when scrolling to the cursor.
const rect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} });
w.Range.prototype.getBoundingClientRect = rect as never;
w.Range.prototype.getClientRects = (() => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })) as never;
w.Element.prototype.getClientRects = (() => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })) as never;
w.document.elementFromPoint = (() => null) as never;

export const doc = w.document;
