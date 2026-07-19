/**
 * Generates the Lattice source icon (1024×1024 PNG) without image
 * dependencies: an indigo rounded square with a white lattice grid.
 * The platform icon set is derived from it via `npx tauri icon`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 1024;
const BG = [0x4f, 0x5b, 0x93, 255]; // restrained indigo (see src/styles.css)
const FG = [0xfd, 0xfd, 0xfb, 255]; // near-white editing surface
const RADIUS = 180;
const LINES = [341, 683]; // thirds
const LINE_WIDTH = 56;
const MARGIN = 168;

const pixels = Buffer.alloc(SIZE * SIZE * 4);

function inRoundedSquare(x, y) {
  const r = RADIUS;
  const cx = x < r ? r : x >= SIZE - r ? SIZE - r - 1 : x;
  const cy = y < r ? r : y >= SIZE - r ? SIZE - r - 1 : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function onGrid(x, y) {
  if (x < MARGIN || x >= SIZE - MARGIN || y < MARGIN || y >= SIZE - MARGIN) {
    return false;
  }
  return LINES.some(
    (line) => Math.abs(x - line) < LINE_WIDTH / 2 || Math.abs(y - line) < LINE_WIDTH / 2,
  );
}

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const offset = (y * SIZE + x) * 4;
    const color = inRoundedSquare(x, y) ? (onGrid(x, y) ? FG : BG) : [0, 0, 0, 0];
    pixels.set(color, offset);
  }
}

// PNG encoding: filter byte 0 per scanline, zlib deflate, CRC-32 chunks.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = new URL('../src-tauri/icon-source.png', import.meta.url);
writeFileSync(target, png);
console.log(`wrote ${target.pathname} (${png.length} bytes)`);
