import { copyFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const common = {
  bundle: true,
  loader: { '.css': 'text' },
  minify: true,
  charset: 'utf8',
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
  // Readability is Apache-2.0; section 4 requires its notice to survive redistribution,
  // and the default minifier strips it.
  build({
    ...common,
    entryPoints: ['src/reader/extract/readability.ts'],
    outfile: 'dist/extract.js',
    format: 'esm',
    // esbuild only preserves comments marked @license or /*!, and Readability's header is
    // a plain block comment, so its attribution is restated here explicitly.
    banner: {
      js: [
        '/*!',
        ' * Bundles @mozilla/readability',
        ' * Copyright (c) 2010 Arc90 Inc, and contributors',
        ' * Licensed under the Apache License, Version 2.0',
        ' * http://www.apache.org/licenses/LICENSE-2.0',
        ' * See LICENSE and NOTICE distributed alongside this file.',
        ' */',
      ].join('\n'),
    },
  }),
  build({ ...common, entryPoints: ['src/reader/extract/heuristic.ts'], outfile: 'dist/heuristic.js', format: 'esm' }),
  build({ ...common, entryPoints: ['src/popup/popup.ts'], outfile: 'dist/popup.js', format: 'esm' }),
  copyFile('manifest.json', 'dist/manifest.json'),
  copyFile('LICENSE', 'dist/LICENSE'),
  copyFile('NOTICE', 'dist/NOTICE'),
  copyFile('src/popup/popup.html', 'dist/popup.html'),
  copyFile('src/popup/popup.css', 'dist/popup.css'),
]);

await import('./tools/make-icons.mjs');

for (const file of ['reader.js', 'reader.iife.js', 'extract.js', 'heuristic.js', 'sw.js', 'popup.js']) {
  const bytes = readFileSync(`dist/${file}`);
  console.log(`${file}: ${bytes.length} bytes (${gzipSync(bytes).length} bytes gzipped)`);
}
