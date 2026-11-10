import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalise, parse, plainText, serialize, validate } from '../src/core/index.ts';
import type { Block, DocumentModel, ListBlock, Mark, TextRun } from '../src/core/index.ts';

// ------------------------------------------------------------ seeded generator
let seed = Number(process.env.UMK_SEED ?? 12345);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const ALPHABET = ['a', 'b', 'Z', '1', '2', ' ', ' ', '_', '*', '~', '`', '[', ']', '(', ')', '{', '}', '\\', '#', '-', '=', '>', '|', '<', '.', '!', '+', '"', 'é'];
const word = (min = 1, max = 8) => Array.from({ length: min + Math.floor(rnd() * (max - min + 1)) }, () => pick(ALPHABET)).join('');

function marks(): Mark[] {
  const out: Mark[] = [];
  if (rnd() < 0.25) out.push({ type: 'link', href: word(0, 6) });
  if (rnd() < 0.25) out.push({ type: 'bold' });
  if (rnd() < 0.25) out.push({ type: 'italic' });
  if (rnd() < 0.15) out.push({ type: 'underline' });
  if (rnd() < 0.15) out.push({ type: 'code' });
  return out;
}
const runs = (): TextRun[] => Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ text: word(), marks: marks() }));

function list(depth: number): ListBlock {
  return {
    kind: pick(['bulletList', 'numberedList'] as const),
    items: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({
      content: rnd() < 0.1 ? [] : runs(),
      children: depth < 3 && rnd() < 0.3 ? [list(depth + 1)] : [],
    })),
  };
}
function block(): Block {
  const r = rnd();
  if (r < 0.35) return { kind: pick(['paragraph', 'paragraph', 'title', 'heading', 'subheading'] as const), content: runs() };
  if (r < 0.6) return list(1);
  if (r < 0.75) return { kind: 'codeBlock', language: rnd() < 0.5 ? null : pick(['ts', 'py', 'c++']), text: Array.from({ length: Math.floor(rnd() * 4) }, () => word(0, 6)).join('\n') };
  if (r < 0.9) return { kind: 'image', src: word(0, 10), alt: word(0, 6) };
  return { kind: 'separator' };
}

// --------------------------------------------------------------- round trips
test('random models survive serialize then parse unchanged', () => {
  for (let n = 0; n < Number(process.env.UMK_FUZZ ?? 3000); n++) {
    const model: DocumentModel = { blocks: Array.from({ length: 1 + Math.floor(rnd() * 5) }, block) };
    assert.deepEqual(validate(model), []);
    const text = serialize(model);
    const back = parse(text).model;
    assert.deepEqual(back, canonicalise(model), `model ${n} via:\n${text}`);
    assert.equal(serialize(back), text, `text ${n} not stable:\n${text}`);
  }
});

const CANONICAL = `Big Title
=========

A Heading
---------

# A subheading

Plain with **bold**, *italic*, __underline__, ~marked~, ~green~{green}, \`code\` and [a link](https://example.com).

- one
- two
    - nested
        - deeper
- three

1. first
2. second

\`\`\`ts
const a = 1;

const b = 2;
\`\`\`

![alt text](notes.assets/pic.png)

***

Last line.
`;

test('canonical text parses and writes back byte-identical', () => {
  const { model, diagnostics } = parse(CANONICAL);
  assert.equal(diagnostics.count(), 0, diagnostics.describe());
  assert.equal(serialize(model), CANONICAL);
  assert.deepEqual(model.blocks.map((b) => b.kind), ['title', 'heading', 'subheading', 'paragraph', 'bulletList', 'numberedList', 'codeBlock', 'image', 'separator', 'paragraph']);
});

test('every style combination round-trips', () => {
  const types = ['link', 'bold', 'italic', 'underline', 'code'] as const;
  for (let mask = 0; mask < 32; mask++) {
    const m: Mark[] = types.filter((_, i) => mask & (1 << i)).map((t) =>
      t === 'link' ? { type: 'link', href: 'h' } : { type: t });
    const model: DocumentModel = { blocks: [{ kind: 'paragraph', content: [{ text: 'x', marks: [] }, { text: 'y y', marks: m }, { text: 'z', marks: [] }] }] };
    assert.deepEqual(parse(serialize(model)).model, canonicalise(model), `mask ${mask}`);
  }
});

// ------------------------------------------------------------ lenient reading
test('unsupported syntax stays visible and is reported', () => {
  const src = '> a quote\n\n| a | b |\n\n<div>x</div>\n\n## level two\n';
  const { model, diagnostics } = parse(src);
  assert.equal(diagnostics.count(), 4);
  assert.deepEqual(model.blocks.map((b) => (b.kind === 'paragraph' ? plainText(b.content) : '?')), ['> a quote', '| a | b |', '<div>x</div>', '## level two']);
});

test('broken markup becomes plain characters with a diagnostic', () => {
  const { model, diagnostics } = parse('an **unclosed bold and `code\n');
  assert.equal(diagnostics.count(), 2);
  const p = model.blocks[0]!;
  assert.equal(p.kind === 'paragraph' && plainText(p.content), 'an **unclosed bold and `code');
});

test('hand-written variants are read leniently', () => {
  const { model } = parse('line one\nline two\r\n\r\n- dash item\n  - sub\n- another\n\n2) numbered\n');
  assert.equal(model.blocks.length, 3);
  assert.equal(plainText((model.blocks[0] as { content: TextRun[] }).content), 'line one line two');
  const l = model.blocks[1] as ListBlock;
  assert.equal(l.items.length, 2);
  assert.equal(l.items[0]!.children.length, 1);
});

test('lists deeper than three levels are flattened and reported', () => {
  const { model, diagnostics } = parse('- a\n    - b\n        - c\n            - d\n');
  assert.equal(diagnostics.count(), 1);
  assert.deepEqual(validate(model), []);
});

test('unclosed code block runs to the end and is reported', () => {
  const { model, diagnostics } = parse('```js\nlet x\n');
  assert.equal(diagnostics.count(), 1);
  assert.deepEqual(model.blocks[0], { kind: 'codeBlock', language: 'js', text: 'let x\n'.slice(0, -1) + '' });
});

test('code containing a fence is written with a longer fence', () => {
  const model: DocumentModel = { blocks: [{ kind: 'codeBlock', language: null, text: '```\ninner\n```' }] };
  assert.deepEqual(parse(serialize(model)).model, model);
});

test('empty paragraphs are not stored; opening is read-only', () => {
  const input = 'a\n\n\n\nb\n';
  const before = input;
  const { model } = parse(input);
  assert.equal(input, before);
  assert.equal(serialize(model), 'a\n\nb\n');
  assert.equal(serialize({ blocks: [{ kind: 'paragraph', content: [] }] }), '');
});

test('validate rejects content outside the rules', () => {
  const bad = { blocks: [{ kind: 'table' }, { kind: 'paragraph', content: [{ text: 'a\nb', marks: [{ type: 'sparkle' }] }] }] } as unknown as DocumentModel;
  assert.equal(validate(bad).length, 3);
});

test('headings keep their text only, and a lone tilde is plain text', () => {
  const read = parse('Big **Title**\n=====\n\n# A *sub* [x](y)\n\nkeep ~this~ and ~~that\n');
  assert.deepEqual(read.model.blocks.slice(0, 2).map((b) => 'content' in b && b.content.map((r) => [r.text, r.marks.length])), [[['Big Title', 0]], [['A sub x', 0]]]);
  assert.equal(read.diagnostics.items().length >= 3, true);
  assert.equal(serialize(read.model), 'Big Title\n=========\n\n# A sub x\n\nkeep ~this~ and \\~\\~that\n');
});
