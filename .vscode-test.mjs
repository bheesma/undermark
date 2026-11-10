import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test-vscode/*.test.cjs',
  version: 'stable',
  extensionDevelopmentPath: '.',
  launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
  mocha: { ui: 'tdd', timeout: 30000 },
});
