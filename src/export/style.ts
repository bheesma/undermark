/** The look of an exported page: the editor's look with fixed colours (no VS Code theme exists outside VS Code). */
export const EXPORT_CSS = `
:root { color-scheme: light dark; --fg: #1f2328; --bg: #ffffff; --muted: #656d76; --code-bg: #f0f2f4; --link: #0969da; --rule: #1f2328;
  --t-keyword: #0550ae; --t-string: #116329; --t-number: #0a7d8c; --t-title: #8a5a00; --t-attr: #8250df; --t-type: #cf222e; }
@media (prefers-color-scheme: dark) { :root:not(.print) { --fg: #e6edf3; --bg: #0d1117; --muted: #9198a1; --code-bg: #1a1f27; --link: #58a6ff; --rule: #e6edf3;
  --t-keyword: #79c0ff; --t-string: #7ee787; --t-number: #56d4dd; --t-title: #e3b341; --t-attr: #d2a8ff; --t-type: #ff7b72; } }
body { margin: 0; color: var(--fg); background: var(--bg); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.6; }
main { max-width: 52rem; margin: 0 auto; padding: 24px; }
h1 { font-size: 1.9em; margin: .8em 0 .4em; padding: 0 .4em .15em 0; width: fit-content; max-width: 100%; border-bottom: 3px double var(--rule); }
h2 { font-size: 1.45em; margin: .8em 0 .4em; padding: 0 .4em .1em 0; width: fit-content; max-width: 100%; border-bottom: 1px solid var(--rule); }
h3 { font-size: 1.15em; margin: .8em 0 .4em; }
p, ul, ol { margin: 0 0 .8em; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 1em 0; }
a { color: var(--link); }
code { font-family: ui-monospace, Menlo, Consolas, monospace; background: var(--code-bg); padding: 0 .25em; border-radius: 3px; }
pre { margin: 0 0 .8em; padding: .8em 1em; background: var(--code-bg); border-radius: 4px; overflow-x: auto; }
pre code { background: none; padding: 0; line-height: 1.4; }
img { max-width: 100%; display: block; }
.missing { display: inline-block; padding: .4em .6em; border: 1px dashed var(--muted); color: var(--muted); }
.hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-literal { color: var(--t-keyword); }
.hljs-string, .hljs-regexp, .hljs-addition { color: var(--t-string); }
.hljs-number, .hljs-symbol, .hljs-bullet { color: var(--t-number); }
.hljs-comment, .hljs-quote, .hljs-meta { color: var(--muted); font-style: italic; }
.hljs-title, .hljs-function, .hljs-class, .hljs-section, .hljs-name { color: var(--t-title); }
.hljs-attr, .hljs-attribute, .hljs-variable, .hljs-property, .hljs-params { color: var(--t-attr); }
.hljs-type, .hljs-tag, .hljs-deletion { color: var(--t-type); }
nav ul { list-style: none; padding-left: 0; } nav li { margin: .3em 0; }
@media print { main { max-width: none; padding: 0; } pre, img, h1, h2, h3 { break-inside: avoid; } h1, h2, h3 { break-after: avoid; } pre { white-space: pre-wrap; } }
`;
