/**
 * Renders a webview (data grid or SQL console) as a standalone page under .harness/ with a stubbed
 * `acquireVsCodeApi`, so the bundled media/*.js can be exercised in a plain browser.
 * Messages the page posts are collected in `window.posted`; `window.reply(message)` plays a host
 * message back, `window.load(payload)` is a shortcut for the grid's "data" message.
 *
 *   bun run build && bun scripts/webview-harness.ts && python3 -m http.server 8765
 *   → http://127.0.0.1:8765/.harness/grid.html  and  .harness/console.html
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BACKTICK = String.fromCharCode(96);

interface View {
  name: string;
  source: string;
  /** Source ranges (start marker → end marker) evaluated before the template: helpers and constants. */
  preludes: Array<[string, string]>;
  script: string;
  style: string;
}

const VIEWS: View[] = [
  {
    name: 'grid',
    source: 'src/views/dataGridView.ts',
    preludes: [
      ['function icon(', '\n}'],
      ['const ICONS = {', '\n};'],
    ],
    script: 'grid.js',
    style: 'grid.css',
  },
  {
    name: 'console',
    source: 'src/views/sqlConsoleView.ts',
    preludes: [
      ['const EXPORT_ARROW =', ">';"],
      ['const TRASH_ICON =', ">';"],
    ],
    script: 'console.js',
    style: 'console.css',
  },
];

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
  window.acquireVsCodeApi = () => ({ postMessage: (message) => window.posted.push(message), getState: () => undefined, setState: () => undefined });
  window.reply = (payload) => window.dispatchEvent(new MessageEvent('message', { data: payload }));
  window.load = (payload) => window.reply({ type: 'data', ...payload });
</script>
`;

function render(view: View): string {
  const source = readFileSync(view.source, 'utf8');
  const slice = (from: string, to: string): string => {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start + from.length);
    if (start < 0 || end < 0) {
      throw new Error(`Cannot find ${from} … ${to} in ${view.source}`);
    }
    return source.slice(start, end + to.length);
  };
  const preludes = view.preludes.map(([from, to]) => slice(from, to));
  const template = slice(`return ${BACKTICK}<!DOCTYPE html>`, `</html>${BACKTICK};`).replace(/^return /, '');
  // Helpers carry TS annotations; strip them before evaluating.
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync([...preludes, `return ${template}`].join('\n'));
  const build = new Function('webview', 'scriptUri', 'baseStyleUri', 'styleUri', 'nonce', body) as (
    webview: { cspSource: string },
    scriptUri: string,
    baseStyleUri: string,
    styleUri: string,
    nonce: string,
  ) => string;
  let html = build({ cspSource: "'self'" }, `../media/${view.script}`, '../media/base.css', `../media/${view.style}`, 'harness');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '');
  const sample = view.name === 'grid' ? '<script src="sample.js"></script>\n' : '';
  return html.replace('<script nonce="harness"', `${THEME}${sample}<script nonce="harness"`);
}

mkdirSync('.harness', { recursive: true });
for (const view of VIEWS) {
  writeFileSync(`.harness/${view.name}.html`, render(view));
  console.log(`wrote .harness/${view.name}.html`);
}
copyFileSync('scripts/grid-sample.js', '.harness/sample.js');
