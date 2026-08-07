import { build } from 'esbuild';

await build({
  entryPoints: ['src/reader/index.ts'],
  outfile: 'dist/reader.js',
  bundle: true,
  format: 'esm',
  loader: { '.css': 'text' },
  minify: true,
  target: 'chrome116',
});
