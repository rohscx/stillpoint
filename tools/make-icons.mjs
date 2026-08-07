import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';

const OUTPUT_DIRECTORY = new URL('../dist/icons/', import.meta.url);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BACKGROUND = [0x16, 0x18, 0x1c, 0xff];
const RULE = [0x3a, 0x3d, 0x42, 0xff];
const ORP = [0xd0, 0x02, 0x1b, 0xff];

// Every icon has deliberately integer-aligned geometry for its own pixel grid. The
// 16 px mark omits hashes because a useful gap cannot coexist with legible 1 px rules.
const DESIGNS = new Map([
  [16, { radius: 3, left: 3, right: 12, top: 4, bottom: 11, rule: 1, orpX: 6, orpWidth: 2, orpTop: 6, orpBottom: 9, hash: 0 }],
  [32, { radius: 5, left: 5, right: 26, top: 7, bottom: 24, rule: 1, orpX: 12, orpWidth: 3, orpTop: 12, orpBottom: 19, hash: 3 }],
  [48, { radius: 7, left: 7, right: 40, top: 10, bottom: 37, rule: 1, orpX: 18, orpWidth: 4, orpTop: 18, orpBottom: 29, hash: 4 }],
  [128, { radius: 18, left: 18, right: 109, top: 27, bottom: 100, rule: 2, orpX: 50, orpWidth: 10, orpTop: 48, orpBottom: 79, hash: 11 }],
]);

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

function setPixel(row, x, colour) {
  const offset = 1 + x * 4;
  row.set(colour, offset);
}

function isInsideRoundedSquare(x, y, size, radius) {
  const cx = x < radius ? radius - 1 : x >= size - radius ? size - radius : x;
  const cy = y < radius ? radius - 1 : y >= size - radius ? size - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= (radius - 0.5) ** 2;
}

function imageData(size, design) {
  const rows = [];
  const redLeft = design.orpX - Math.floor((design.orpWidth - 1) / 2);
  const redRight = redLeft + design.orpWidth - 1;
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4); // PNG filter byte 0 followed by RGBA pixels.
    for (let x = 0; x < size; x += 1) {
      if (!isInsideRoundedSquare(x, y, size, design.radius)) continue;
      let colour = BACKGROUND;
      const onRule = x >= design.left && x <= design.right
        && ((y >= design.top && y < design.top + design.rule)
          || (y > design.bottom - design.rule && y <= design.bottom));
      const onHash = design.hash > 0 && x >= design.orpX && x < design.orpX + design.rule
        && ((y >= design.top && y <= design.top + design.hash)
          || (y >= design.bottom - design.hash && y <= design.bottom));
      const onOrp = x >= redLeft && x <= redRight && y >= design.orpTop && y <= design.orpBottom;
      if (onRule || onHash) colour = RULE;
      if (onOrp) colour = ORP;
      setPixel(row, x, colour);
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

function png(size, design) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8-bit RGBA, non-interlaced.
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(imageData(size, design))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function verifyPng(bytes, expectedSize) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`icon-${expectedSize}.png has an invalid signature`);
  let offset = 8;
  let width;
  let height;
  const imageChunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const storedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (storedCrc !== actualCrc) throw new Error(`icon-${expectedSize}.png has a bad ${type} CRC`);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === 'IDAT') imageChunks.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (width !== expectedSize || height !== expectedSize) throw new Error(`icon-${expectedSize}.png has incorrect dimensions`);
  const pixels = inflateSync(Buffer.concat(imageChunks));
  if (pixels.length !== expectedSize * (1 + expectedSize * 4)) throw new Error(`icon-${expectedSize}.png has incomplete pixels`);
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all([...DESIGNS].map(async ([size, design]) => {
  const bytes = png(size, design);
  verifyPng(bytes, size);
  await writeFile(new URL(`icon-${size}.png`, OUTPUT_DIRECTORY), bytes);
}));
