/**
 * PasteGuard, step one: tidy what the clipboard HTML says before the schema reads it.
 * Step two is the schema itself: anything it cannot represent (fonts, sizes, colours,
 * tables, quotes) is dropped while the words stay.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, meta, link, title, head, noscript, template, o\\:p').forEach((el) => el.remove());

  // Tables and rows become one line of text per row, so cell contents do not run together.
  doc.querySelectorAll('tr').forEach((tr) => {
    const p = doc.createElement('p');
    const cells = Array.from(tr.children).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
    p.textContent = cells.filter(Boolean).join(' ');
    tr.replaceWith(p);
  });
  doc.querySelectorAll('table, thead, tbody, tfoot, caption, colgroup').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  // Blockquotes keep their paragraphs but not the quote.
  doc.querySelectorAll('blockquote').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  // Strikethrough is not allowed; its text stays.
  doc.querySelectorAll('s, strike, del').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  return doc.body.innerHTML;
}

/** Editor props that route all pasted and dropped HTML through the guard. */
export const pasteGuardProps = {
  transformPastedHTML: cleanPastedHtml,
};
