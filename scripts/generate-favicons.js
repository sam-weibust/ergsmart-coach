#!/usr/bin/env node
import sharp from 'sharp';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const logoPath = join(root, 'src/assets/crewsync-logo-icon.jpg');

// Delete existing favicon files
const existing = [
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'og-image.png',
];
for (const f of existing) {
  const p = join(publicDir, f);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`Deleted ${f}`);
  }
}

const logo = sharp(logoPath);

// favicon-16x16.png
await logo.clone().resize(16, 16, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png().toFile(join(publicDir, 'favicon-16x16.png'));
console.log('Generated favicon-16x16.png');

// favicon-32x32.png
await logo.clone().resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png().toFile(join(publicDir, 'favicon-32x32.png'));
console.log('Generated favicon-32x32.png');

// apple-touch-icon.png (180x180)
await logo.clone().resize(180, 180, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
  .png().toFile(join(publicDir, 'apple-touch-icon.png'));
console.log('Generated apple-touch-icon.png');

// android-chrome-192x192.png
await logo.clone().resize(192, 192, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
  .png().toFile(join(publicDir, 'android-chrome-192x192.png'));
console.log('Generated android-chrome-192x192.png');

// og-image.png (1200x630, navy background, logo centered, logo fills ~50% height = 315px)
const logoSize = 315;
const logoResized = await logo.clone()
  .resize(logoSize, logoSize, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
  .png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 10, g: 22, b: 40 } } })
  .composite([{ input: logoResized, gravity: 'center' }])
  .png().toFile(join(publicDir, 'og-image.png'));
console.log('Generated og-image.png');

// favicon.ico — real ICO with 16x16 and 32x32 embedded
// Build ICO format manually: ICONDIR + 2 ICONDIRENTRY + BMP data
const img16 = await logo.clone().resize(16, 16, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 255 } })
  .raw().toBuffer({ resolveWithObject: true });
const img32 = await logo.clone().resize(32, 32, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 255 } })
  .raw().toBuffer({ resolveWithObject: true });

function makeBMP(raw, width, height) {
  const rowSize = width * 4; // BGRA
  const bmpDataSize = rowSize * height;
  const andMaskRowSize = Math.ceil(width / 8) * 4; // padded to DWORD
  const andMaskSize = andMaskRowSize * height;
  const headerSize = 40;
  const totalSize = headerSize + bmpDataSize + andMaskSize;

  const buf = Buffer.alloc(totalSize);
  let off = 0;

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, off); off += 4;         // biSize
  buf.writeInt32LE(width, off); off += 4;        // biWidth
  buf.writeInt32LE(height * 2, off); off += 4;   // biHeight (doubled for ICO)
  buf.writeUInt16LE(1, off); off += 2;           // biPlanes
  buf.writeUInt16LE(32, off); off += 2;          // biBitCount (32bpp BGRA)
  buf.writeUInt32LE(0, off); off += 4;           // biCompression BI_RGB
  buf.writeUInt32LE(bmpDataSize, off); off += 4; // biSizeImage
  buf.writeInt32LE(0, off); off += 4;            // biXPelsPerMeter
  buf.writeInt32LE(0, off); off += 4;            // biYPelsPerMeter
  buf.writeUInt32LE(0, off); off += 4;           // biClrUsed
  buf.writeUInt32LE(0, off); off += 4;           // biClrImportant

  // XOR mask: raw is RGB, write rows bottom-up as BGRA with full alpha
  const { channels } = raw.info;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * channels;
      const r = raw.data[srcIdx];
      const g = raw.data[srcIdx + 1];
      const b = raw.data[srcIdx + 2];
      buf[off++] = b;
      buf[off++] = g;
      buf[off++] = r;
      buf[off++] = 255; // alpha = opaque
    }
  }

  // AND mask: all zeros = fully opaque
  off += andMaskSize;

  return buf;
}

const bmp16 = makeBMP(img16, 16, 16);
const bmp32 = makeBMP(img32, 32, 32);

// ICO header (ICONDIR)
const numImages = 2;
const headerBytes = 6 + numImages * 16; // ICONDIR + ICONDIRENTRYs
const ico = Buffer.alloc(headerBytes + bmp16.length + bmp32.length);
let pos = 0;

// ICONDIR
ico.writeUInt16LE(0, pos); pos += 2;         // idReserved
ico.writeUInt16LE(1, pos); pos += 2;         // idType = 1 (ICO)
ico.writeUInt16LE(numImages, pos); pos += 2; // idCount

// ICONDIRENTRY for 16x16
const offset16 = headerBytes;
ico.writeUInt8(16, pos++);               // bWidth
ico.writeUInt8(16, pos++);               // bHeight
ico.writeUInt8(0, pos++);                // bColorCount
ico.writeUInt8(0, pos++);                // bReserved
ico.writeUInt16LE(1, pos); pos += 2;     // wPlanes
ico.writeUInt16LE(32, pos); pos += 2;    // wBitCount
ico.writeUInt32LE(bmp16.length, pos); pos += 4; // dwBytesInRes
ico.writeUInt32LE(offset16, pos); pos += 4;     // dwImageOffset

// ICONDIRENTRY for 32x32
const offset32 = headerBytes + bmp16.length;
ico.writeUInt8(32, pos++);
ico.writeUInt8(32, pos++);
ico.writeUInt8(0, pos++);
ico.writeUInt8(0, pos++);
ico.writeUInt16LE(1, pos); pos += 2;
ico.writeUInt16LE(32, pos); pos += 2;
ico.writeUInt32LE(bmp32.length, pos); pos += 4;
ico.writeUInt32LE(offset32, pos); pos += 4;

// Copy BMP data
bmp16.copy(ico, headerBytes);
bmp32.copy(ico, offset32);

writeFileSync(join(publicDir, 'favicon.ico'), ico);
console.log(`Generated favicon.ico (${ico.length} bytes, 16x16 + 32x32)`);

console.log('\nDone! All favicon files generated in /public');
