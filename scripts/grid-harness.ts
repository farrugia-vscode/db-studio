/**
 * Renders the data-grid webview as a standalone page (.harness/grid.html) with a stubbed
 * `acquireVsCodeApi`, so the bundled media/grid.js can be exercised in a plain browser.
 * Messages the grid posts are collected in `window.posted`; feed it data with `window.load(payload)`.
 *
 *   bun run build && bun scripts/grid-harness.ts && python3 -m http.server 8765
 *   → http://127.0.0.1:8765/.harness/grid.html
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('src/views/dataGridView.ts', 'utf8');

function slice(from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start < 0 || end < 0) {
    throw new Error(`Cannot find ${from} … ${to} in dataGridView.ts`);
  }
  return source.slice(start, end);
}

const BACKTICK = String.fromCharCode(96);
const iconHelper = slice('function icon(', '\nconst ICONS = {');
const icons = slice('const ICONS = {', '\n};\n') + '\n};';
const template = slice(`return ${BACKTICK}<!DOCTYPE html>`, `${BACKTICK};\n}`).replace(/^return /, '') + BACKTICK;

// The helper carries TS annotations; strip them before evaluating.
const body = new Bun.Transpiler({ loader: 'ts' }).transformSync([iconHelper, icons, `return ${template};`].join('\n'));
const render = new Function('webview', 'scriptUri', 'baseStyleUri', 'styleUri', 'nonce', body) as (
  webview: { cspSource: string },
  scriptUri: string,
  baseStyleUri: string,
  styleUri: string,
  nonce: string,
) => string;

const THEME = `
<style>
:root{--vscode-font-family:"Segoe UI",Ubuntu,sans-serif;--vscode-editor-font-family:"Ubuntu Mono",monospace;
--vscode-foreground:#3b3b3b;--vscode-editor-background:#fff;--vscode-editorWidget-background:#f8f8f8;
--vscode-panel-border:#e5e5e5;--vscode-descriptionForeground:#717171;--vscode-input-foreground:#3b3b3b;
--vscode-input-background:#fff;--vscode-input-border:#cecece;--vscode-focusBorder:#005fb8;
--vscode-button-foreground:#fff;--vscode-button-background:#005fb8;--vscode-button-hoverBackground:#0258a8;
--vscode-testing-iconPassed:#73c991;--vscode-errorForeground:#f85149;--vscode-list-hoverBackground:#f2f2f2;
--vscode-list-activeSelectionBackground:#0060c0;--vscode-badge-background:#005fb8;--vscode-badge-foreground:#fff;}
</style>
<script>
  window.posted = [];
  window.acquireVsCodeApi = () => ({ postMessage: (message) => window.posted.push(message) });
  // Push a "data" message like the extension host would.
  window.load = (payload) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'data', ...payload } }));
  window.reply = (payload) => window.dispatchEvent(new MessageEvent('message', { data: payload }));
</script>
`;

let html = render({ cspSource: "'self'" }, '../media/grid.js', '../media/base.css', '../media/grid.css', 'harness');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '');
html = html.replace('<script nonce="harness"', `${THEME}<script src="sample.js"></script>\n<script nonce="harness"`);

mkdirSync('.harness', { recursive: true });
writeFileSync('.harness/grid.html', html);
copyFileSync('scripts/grid-sample.js', '.harness/sample.js');
console.log('wrote .harness/grid.html');
