import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const KIB = 1024;
const REQUIRED_PERMISSIONS = ['activeTab', 'contextMenus', 'scripting', 'storage'];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await filesBelow(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString('en-US')} B`;
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const distFiles = await filesBelow('dist');
const totalBytes = (await Promise.all(distFiles.map(async (file) => (await stat(file)).size)))
  .reduce((sum, size) => sum + size, 0);
const readerGzip = gzipSync(await readFile('dist/reader.iife.js')).length;
const extractGzip = gzipSync(await readFile('dist/extract.js')).length;
const dependencies = Object.keys(packageJson.dependencies ?? {}).sort();
const permissions = Array.isArray(manifest.permissions) ? [...manifest.permissions].sort() : [];

const rows = [
  ['Total unpacked extension size', formatBytes(totalBytes), `≤ ${formatBytes(250 * KIB)}`, totalBytes <= 250 * KIB],
  ['Injected runtime, gzipped', formatBytes(readerGzip), `≤ ${formatBytes(45 * KIB)}`, readerGzip <= 45 * KIB],
  ['Readability chunk, gzipped', formatBytes(extractGzip), `≤ ${formatBytes(30 * KIB)}`, extractGzip <= 30 * KIB],
  ['Runtime dependencies', `${dependencies.length}: ${dependencies.join(', ') || '(none)'}`, 'exactly 1: @mozilla/readability', dependencies.length === 1 && dependencies[0] === '@mozilla/readability'],
  ['host_permissions', Object.hasOwn(manifest, 'host_permissions') ? 'present' : 'absent', 'absent', !Object.hasOwn(manifest, 'host_permissions')],
  ['content_scripts', Object.hasOwn(manifest, 'content_scripts') ? 'present' : 'absent', 'absent', !Object.hasOwn(manifest, 'content_scripts')],
  ['Permissions', permissions.join(', '), REQUIRED_PERMISSIONS.join(', '), JSON.stringify(permissions) === JSON.stringify(REQUIRED_PERMISSIONS)],
];

const headings = ['Constraint', 'Actual', 'Budget', 'Status'];
const widths = headings.map((heading, index) => Math.max(heading.length, ...rows.map((row) => String(row[index]).length)));
const line = (values) => `| ${values.map((value, index) => String(value).padEnd(widths[index])).join(' | ')} |`;
const divider = `+-${widths.map((width) => '-'.repeat(width)).join('-+-')}-+`;

console.log(divider);
console.log(line(headings));
console.log(divider);
for (const row of rows) console.log(line([row[0], row[1], row[2], row[3] ? 'PASS' : 'FAIL']));
console.log(divider);

const failures = rows.filter((row) => !row[3]);
if (failures.length > 0) {
  console.error(`Budget audit failed: ${failures.map((row) => row[0]).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Budget audit passed.');
}
