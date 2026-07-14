import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const extensionConfig: esbuild.BuildOptions = {
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode', 'pg-native', 'cloudflare:sockets'],
  sourcemap: true,
  logLevel: 'info',
};

const webviewEntries: Array<[string, string]> = [
  ['src/webview/grid.ts', 'media/grid.js'],
  ['src/webview/form.ts', 'media/form.js'],
  ['src/webview/designer.ts', 'media/designer.js'],
];

const webviewConfigs: esbuild.BuildOptions[] = webviewEntries.map(([entry, outfile]) => ({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  sourcemap: true,
  logLevel: 'info',
}));

const allConfigs = [extensionConfig, ...webviewConfigs];

async function run(): Promise<void> {
  if (isWatch) {
    const contexts = await Promise.all(allConfigs.map((config) => esbuild.context(config)));
    await Promise.all(contexts.map((context) => context.watch()));
    return;
  }
  await Promise.all(allConfigs.map((config) => esbuild.build(config)));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
