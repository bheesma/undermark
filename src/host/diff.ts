export interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

/**
 * The smallest single replacement turning one text into another (common start and end kept).
 * Small edits keep VS Code's undo steps, decorations and git gutter precise.
 */
export function minimalEdit(from: string, to: string): TextEdit | null {
  if (from === to) return null;
  let start = 0;
  const max = Math.min(from.length, to.length);
  while (start < max && from[start] === to[start]) start++;
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) {
    endFrom--;
    endTo--;
  }
  // never split a surrogate pair
  const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
  if (start > 0 && isLow(from.charCodeAt(start))) start--;
  if (endFrom < from.length && isLow(from.charCodeAt(endFrom)) && endFrom > start) { endFrom++; endTo++; }
  return { start, end: endFrom, replacement: to.slice(start, endTo) };
}

export function applyTextEdit(text: string, edit: TextEdit): string {
  return text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
}
