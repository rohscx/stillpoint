import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const OUTPUT_DIRECTORY = new URL('../dist/icons/', import.meta.url);
const SIZES = [16, 32, 48, 128];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function imageData(size) {
  const rows = [];
  const radius = Math.max(2, Math.round(size * 0.18));
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(radius - x, 0, x - (size - radius - 1));
      const dy = Math.max(radius - y, 0, y - (size - radius - 1));
      const inside = dx * dx + dy * dy <= radius * radius;
      const offset = 1 + x * 4;
      row[offset] = 0xd0;
      row[offset + 1] = 0x02;
      row[offset + 2] = 0x1b;
      row[offset + 3] = inside ? 0xff : 0x00;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(imageData(size))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all(SIZES.map((size) => writeFile(new URL(`icon-${size}.png`, OUTPUT_DIRECTORY), png(size))));
