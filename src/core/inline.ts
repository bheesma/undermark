import { MARK_ORDER, normalizeRuns } from './documentModel.ts';
import type { Mark, MarkType, TextRun } from './documentModel.ts';

const ESCAPABLE = /[!-/:-@[-`{-~ ]/;

/** Any ASCII punctuation or space may follow a backslash. */
export function isEscapable(ch: string | undefined): boolean {
  return ch !== undefined && ESCAPABLE.test(ch);
}

// ---------------------------------------------------------------- serializing

function escapeText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if ('\\*`[]'.includes(ch)) out += '\\' + ch;
    // a lone ~ is plain text; a pair would read as strikethrough
    else if (ch === '~' && (text[i - 1] === '~' || text[i + 1] === '~')) out += '\\~';
    else if (ch === '_' && (i === 0 || i === text.length - 1 || text[i - 1] === '_' || text[i + 1] === '_')) out += '\\_';
    else if (ch === '{' && i === 0) out += '\\{';
    else out += ch;
  }
  return out;
}

/** Escapes link addresses and image sources: backslash, parentheses and whitespace. */
export function escapeAddress(text: string): string {
  return text.replace(/[\\() ]/g, (c) => '\\' + c);
}

export function escapeAlt(text: string): string {
  return text.replace(/[\\[\]]/g, (c) => '\\' + c);
}

function codeSpan(text: string): string {
  const runs = new Set((text.match(/`+/g) ?? []).map((r) => r.length));
  let n = 1;
  while (runs.has(n)) n++;
  const fence = '`'.repeat(n);
  const padded = text.startsWith('`') || text.endsWith('`') || (/^ .*\S.* $/.test(text) && text.trim() !== '');
  return padded ? `${fence} ${text} ${fence}` : fence + text + fence;
}

function sameValue(a: Mark, b: Mark): boolean {
  if (a.type === 'link') return a.href === (b as typeof a).href;
  return true;
}

function emit(runs: TextRun[], from: number): string {
  let out = '';
  let i = 0;
  while (i < runs.length) {
    const run = runs[i]!;
    const mark = run.marks.find((m) => MARK_ORDER.indexOf(m.type) >= from);
    if (!mark) {
      out += escapeText(run.text);
      i++;
      continue;
    }
    const idx = MARK_ORDER.indexOf(mark.type);
    // a run joins only if this is its outermost unconsumed mark too
    const joins = (r: TextRun) =>
      r.marks.find((m) => MARK_ORDER.indexOf(m.type) >= from)?.type === mark.type && r.marks.some((m) => m.type === mark.type && sameValue(m, mark));
    let j = i + 1;
    while (j < runs.length && joins(runs[j]!)) j++;
    const group = runs.slice(i, j);
    if (mark.type === 'code') {
      out += codeSpan(group.map((r) => r.text).join(''));
    } else {
      const inner = emit(group, idx + 1);
      switch (mark.type) {
        case 'bold': out += `**${inner}**`; break;
        case 'italic': out += `*${inner}*`; break;
        case 'underline': out += `__${inner}__`; break;
        case 'link':
          // "![" would read as an image block
          if (out.endsWith('!')) out = out.slice(0, -1) + '\\!';
          out += `[${inner}](${escapeAddress(mark.href)})`;
          break;
      }
    }
    i = j;
  }
  return out;
}

/** Runs must already be canonical (see canonicalise). */
export function serializeInline(runs: TextRun[]): string {
  return emit(runs, 0);
}

// -------------------------------------------------------------------- parsing

export interface InlineResult {
  runs: TextRun[];
  problems: string[];
}

export function parseInline(src: string): InlineResult {
  let pos = 0;
  let out: TextRun[] = [];
  let problems: string[] = [];
  const open: MarkType[] = [];

  /** Reads an address up to an unescaped ")" (pos is just after "("); null if unterminated. */
  function readAddress(): string | null {
    let value = '';
    while (pos < src.length) {
      const ch = src[pos]!;
      if (ch === '\\' && isEscapable(src[pos + 1])) { value += src[pos + 1]; pos += 2; continue; }
      if (ch === ')') { pos++; return value; }
      value += ch;
      pos++;
    }
    return null;
  }

  function seq(marks: Mark[], stop: string | null): boolean {
    let buf = '';
    const flush = () => {
      if (buf) out.push({ text: buf, marks: [...marks] });
      buf = '';
    };
    /** Tries to parse a delimited span; on failure the opener becomes literal text. */
    const attempt = (token: string, type: MarkType, run: () => boolean, label: string): void => {
      if (open.includes(type)) { buf += token; pos += token.length; return; }
      flush();
      const saved = { pos, len: out.length, problems: problems.length };
      pos += token.length;
      open.push(type);
      const ok = run();
      open.pop();
      if (!ok) {
        out.length = saved.len;
        problems.length = saved.problems;
        pos = saved.pos + token.length;
        buf += token;
        problems.push(`unclosed ${label} kept as plain characters`);
      }
    };

    while (pos < src.length) {
      const ch = src[pos]!;
      if (ch === '\\' && isEscapable(src[pos + 1])) { buf += src[pos + 1]; pos += 2; continue; }

      if (stop !== null && src.startsWith(stop, pos)) {
        const nestedBold = stop === '*' && src.startsWith('**', pos) && !src.startsWith('***', pos) && !open.includes('bold');
        if (!nestedBold) {
          flush();
          pos += stop.length;
          return true;
        }
      }

      if (ch === '`') {
        let n = 0;
        while (src[pos + n] === '`') n++;
        const tick = '`'.repeat(n);
        let end = pos + n;
        let found = -1;
        while ((end = src.indexOf(tick, end)) !== -1) {
          let m = 0;
          while (src[end + m] === '`') m++;
          if (m === n) { found = end; break; }
          end += m;
        }
        if (found === -1) {
          buf += tick;
          pos += n;
          problems.push('unclosed code span kept as plain characters');
        } else {
          flush();
          let code = src.slice(pos + n, found);
          if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') code = code.slice(1, -1);
          out.push({ text: code, marks: [...marks, { type: 'code' }] });
          pos = found + n;
        }
        continue;
      }

      if (ch === '[') {
        if (open.includes('link')) { buf += ch; pos++; continue; }
        attempt('[', 'link', () => {
          const start = out.length;
          if (!seq(marks, ']') || src[pos] !== '(') return false;
          pos++;
          const href = readAddress();
          if (href === null) return false;
          for (let k = start; k < out.length; k++) out[k]!.marks.push({ type: 'link', href });
          return true;
        }, 'link');
        continue;
      }

      if (src.startsWith('~~', pos)) {
        buf += '~~';
        pos += 2;
        problems.push('strikethrough is not supported; kept as plain characters');
        continue;
      }
      const delimiters: [string, MarkType, Mark, string][] = [
        ['**', 'bold', { type: 'bold' }, '**'],
        ['*', 'italic', { type: 'italic' }, '*'],
        ['__', 'underline', { type: 'underline' }, '__'],
      ];
      const hit = delimiters.find(([token]) => src.startsWith(token, pos));
      if (hit) {
        const [token, type, mark] = hit;
        attempt(token, type, () => {
          return seq([...marks, mark], token);
        }, token === '*' ? '*' : token);
        continue;
      }

      buf += ch;
      pos++;
    }
    flush();
    return stop === null;
  }

  seq([], null);
  return { runs: normalizeRuns(out), problems };
}

