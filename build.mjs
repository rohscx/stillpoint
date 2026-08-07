import { copyFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const common = {
  bundle: true,
  loader: { '.css': 'text' },
  minify: true,
  target: 'chrome116',
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/reader/index.ts'],
    outfile: 'dist/reader.js',
    format: 'esm',
    define: { __STILLPOINT_INJECTED__: 'false' },
  }),
  build({
    ...common,
    entryPoints: ['src/reader/index.ts'],
    outfile: 'dist/reader.iife.js',
    format: 'iife',
    define: { __STILLPOINT_INJECTED__: 'true' },
  }),
  build({ ...common, entryPoints: ['src/sw.ts'], outfile: 'dist/sw.js', format: 'esm' }),
  build({ ...common, entryPoints: ['src/popup/popup.ts'], outfile: 'dist/popup.js', format: 'esm' }),
  copyFile('manifest.json', 'dist/manifest.json'),
  copyFile('src/popup/popup.html', 'dist/popup.html'),
  copyFile('src/popup/popup.css', 'dist/popup.css'),
]);

await import('./tools/make-icons.mjs');

for (const file of ['reader.js', 'reader.iife.js', 'sw.js', 'popup.js']) {
  const bytes = readFileSync(`dist/${file}`);
  console.log(`${file}: ${bytes.length} bytes (${gzipSync(bytes).length} bytes gzipped)`);
}
