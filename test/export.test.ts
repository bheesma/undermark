import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from '../src/core/index.ts';
import { exportHtml, exportIndex, isSafeHref, renderBody } from '../src/export/html.ts';
import { exportMarkdown } from '../src/export/markdown.ts';
import { browserCandidates, isRemotePicture, mimeOfPicture, outputFolderName, outputRelativePath } from '../src/export/names.ts';

const model = (text: string) => parse(text).model;

test('html: blocks and styles become the matching elements, nested in the stored order', () => {
  const html = renderBody(model('Title\n=====\n\nHead\n----\n\n# Sub\n\nA **bold *both*** and __under__ and `x < y`\n\n***'));
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<h2>Head<\/h2>/);
  assert.match(html, /<h3>Sub<\/h3>/);
  assert.match(html, /<strong>bold <\/strong><strong><em>both<\/em><\/strong>/);
  assert.match(html, /<u>under<\/u>/);
  assert.match(html, /<code>x &lt; y<\/code>/);
  assert.match(html, /<hr>/);
});

test('html: text is escaped and unsafe links lose their address', () => {
  const html = renderBody(model('<b> & "q" [bad](javascript:alert(1)) [ok](https://a.b/?x=1&y=2)'));
  assert.doesNotMatch(html, /<b>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /href="https:\/\/a\.b\/\?x=1&amp;y=2"/);
  assert.equal(isSafeHref('notes/other.html'), true);
  assert.equal(isSafeHref('vbscript:x'), false);
});

test('html: lists nest, code is coloured, pictures go through the resolver', () => {
  const html = renderBody(
    model('- one\n    - inner\n- two\n\n1. a\n2. b\n\n```js\nconst x = 1;\n```\n\n![cat](cat.png)'),
    { resolveImage: (s) => `data:image/png;base64,${s}` },
  );
  assert.match(html, /<ul><li>one<ul><li>inner<\/li><\/ul><\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
  assert.match(html, /<img src="data:image\/png;base64,cat\.png" alt="cat">/);
});

test('html: a full page is self-contained, and an index lists documents', () => {
  const page = exportHtml(model('Hi'), { title: 'A <b>' });
  assert.match(page, /<title>A &lt;b&gt;<\/title>/);
  assert.match(page, /<style>/);
  assert.doesNotMatch(page, /<script|<link /);
  assert.match(exportHtml(model('Hi'), { print: true }), /<html lang="en" class="print">/);
  assert.match(exportIndex('Notes', [{ href: 'a/b.html', label: 'a/b' }]), /<a href="a\/b\.html">a\/b<\/a>/);
});

test('markdown: blocks, nesting and underline fallback', () => {
  const md = exportMarkdown(model('Title\n=====\n\nHead\n----\n\n# Sub\n\n**b** *i* __u__ `c` [t](https://x.y)\n\n- one\n    - inner\n\n1. a\n2. b\n\n***\n\n![cat](cat.png)'));
  assert.equal(
    md,
    '# Title\n\n## Head\n\n### Sub\n\n**b** *i* <u>u</u> `c` [t](https://x.y)\n\n- one\n    - inner\n\n1. a\n2. b\n\n---\n\n![cat](cat.png)\n',
  );
});

test('markdown: characters with meaning are escaped and markers hug their text', () => {
  const md = exportMarkdown(model('a \\* b \\_ c \\<d\\> **x ** y'));
  assert.match(md, /a \\\* b \\_ c \\<d\\>/);
  assert.match(md, /\*\*x\*\* +y/);
  assert.equal(exportMarkdown(model('\\- not a bullet')), '\\- not a bullet\n');
  assert.equal(exportMarkdown(model('``a`b``')), '``a`b``\n');
});

test('markdown: code fences outgrow the code, addresses with spaces are wrapped', () => {
  const md = exportMarkdown(model('````\n```\ninner\n```\n````\n\n![x](a\\ b.png)'));
  assert.match(md, /^````\n```\ninner\n```\n````/);
  assert.match(md, /!\[x\]\(<a b\.png>\)/);
  assert.equal(exportMarkdown({ blocks: [] }), '');
});

test('naming: output paths, pictures and browsers', () => {
  assert.equal(outputRelativePath('a/b.umk', 'html'), 'a/b.html');
  assert.equal(outputRelativePath('b.UMK', 'markdown'), 'b.md');
  assert.equal(outputFolderName('pdf'), 'export/pdf');
  assert.equal(mimeOfPicture('x.JPG'), 'image/jpeg');
  assert.equal(mimeOfPicture('x.txt'), undefined);
  assert.equal(isRemotePicture('https://a/b.png'), true);
  assert.equal(isRemotePicture('notes.assets/a.png'), false);
  assert.ok(browserCandidates('darwin', {})[0]!.includes('Google Chrome'));
  assert.ok(browserCandidates('win32', { PROGRAMFILES: 'C:\\P' })[0]!.startsWith('C:\\P'));
  assert.ok(browserCandidates('linux', {}).includes('/usr/bin/chromium'));
});
