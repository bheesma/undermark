import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const common = { bundle: true, target: 'es2022', sourcemap: true, logLevel: 'info' };

// 1. the extension host (Node, talks to VS Code)
await build({ ...common, entryPoints: ['src/host/extension.ts'], format: 'cjs', platform: 'node', external: ['vscode'], outfile: 'dist/extension.cjs' });

// 2. the screen inside VS Code (browser)
mkdirSync('dist/webview', { recursive: true });
await build({ ...common, entryPoints: ['src/webview/main.ts'], format: 'iife', platform: 'browser', outfile: 'dist/webview/main.js' });
copyFileSync('src/view/editor.css', 'dist/webview/editor.css');

// 3. the plain-browser test page
const page = 'dist/test-page';
mkdirSync(page, { recursive: true });
await build({ ...common, entryPoints: ['test-page/main.ts'], format: 'iife', platform: 'browser', outfile: `${page}/main.js` });
for (const [from, to] of [['test-page/index.html', 'index.html'], ['test-page/themes.css', 'themes.css'], ['src/view/editor.css', 'editor.css']]) copyFileSync(from, `${page}/${to}`);

// 4. tests that run inside a real VS Code
await build({ ...common, entryPoints: ['test-vscode/suite.test.ts'], format: 'cjs', platform: 'node', external: ['vscode', 'mocha'], outfile: 'dist/test-vscode/suite.test.cjs' });
