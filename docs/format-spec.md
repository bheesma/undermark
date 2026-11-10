# Undermark format (.umk) – specification v1

Source of truth: `src/core/`. Contract: *Architecture & Design Contract*, section 6.

## Blocks
Blocks are separated by exactly one blank line. The file ends with one newline. Line endings are written as `\n`; `\r\n` is read.

| Block | Stored as |
| --- | --- |
| Title | text line, then a line of three or more `=` |
| Heading | text line, then a line of three or more `-` |
| Subheading | `# text` |
| Paragraph | one line of text |
| Bullet list | `- item`; nested items indented four spaces, up to three levels |
| Numbered list | `1. item`, written 1, 2, 3 in order; the numbers are not stored in the model |
| Code block | fence of three or more backticks (longer than any backtick line inside), optional language, closing fence |
| Image | `![alt](address)` alone on a line |
| Separator | `***` alone on a line |

## Text styles
`**bold**`, `*italic*`, `__underline__`, `~highlight~` (`~text~{green}` for green, blue, red, magenta, cyan; yellow is the default and written without a suffix), `` `code` ``, `[text](address)`.
Nesting order, outermost first: link, highlight, bold, italic, underline, code. Code content is literal.

## Escaping
A backslash before any ASCII punctuation or space gives that character literally. The writer escapes `\ * ~ \` [ ]`, `_` next to another `_` or at the edge of a run, `{` at the start of a run, `\ ( ) space` in addresses, `\ [ ]` in alt text, and the characters that would start a block at the start of a line (`# - = > | <` and `1.`).

## Reading rules
1. Reading never fails and never changes the file; the writer is only used after the first edit.
2. Unsupported syntax (`>` quotes, `|` tables, HTML, `##` levels, `~~`) stays as visible text and is reported with its line.
3. Unclosed markup (`**`, `` ` ``, `[`, a fence) stays as plain characters and is reported.
4. Lenient: several plain lines join into one paragraph with a space; list items may be indented by any amount (nesting follows relative indent); `2)` numbering is accepted. Deeper than three levels is flattened and reported.
5. Whitespace at the edges of a line, and empty paragraphs, are not stored.
6. `*` and `+` are not bullet markers (`*` is italic).
