import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src/assets/crewsync-logo-icon.jpg');
const resDir = join(root, 'android/app/src/main/res');

const densities = [
  { dir: 'mipmap-mdpi',    size: 48 },
  { dir: 'mipmap-hdpi',    size: 72 },
  { dir: 'mipmap-xhdpi',   size: 96 },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

for (const { dir, size } of densities) {
  const dest = join(resDir, dir);
  mkdirSync(dest, { recursive: true });
  await sharp(src).resize(size, size).toFile(join(dest, 'ic_launcher.png'));
  await sharp(src).resize(size, size).toFile(join(dest, 'ic_launcher_round.png'));
  console.log(`${dir}: ${size}x${size}`);
}

// Play Store icon
const playDir = join(root, 'android/app/src/main/play-store');
mkdirSync(playDir, { recursive: true });
await sharp(src).resize(512, 512).toFile(join(playDir, 'ic_launcher_512.png'));
console.log('Play Store icon: 512x512');

// Splash images for all drawable density dirs
const splashDensities = [
  { dir: 'drawable',              port: [480, 800],   land: [800, 480] },
  { dir: 'drawable-port-mdpi',    port: [320, 480],   land: null },
  { dir: 'drawable-port-hdpi',    port: [480, 800],   land: null },
  { dir: 'drawable-port-xhdpi',   port: [720, 1280],  land: null },
  { dir: 'drawable-port-xxhdpi',  port: [1080, 1920], land: null },
  { dir: 'drawable-port-xxxhdpi', port: [1440, 2560], land: null },
  { dir: 'drawable-land-mdpi',    port: null,         land: [480, 320] },
  { dir: 'drawable-land-hdpi',    port: null,         land: [800, 480] },
  { dir: 'drawable-land-xhdpi',   port: null,         land: [1280, 720] },
  { dir: 'drawable-land-xxhdpi',  port: null,         land: [1920, 1080] },
  { dir: 'drawable-land-xxxhdpi', port: null,         land: [2560, 1440] },
];

async function makeSplash(w, h) {
  const logoSize = Math.round(Math.min(w, h) * 0.35);
  const logo = await sharp(src)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 10, g: 22, b: 40, alpha: 1 } },
  })
    .composite([{ input: logo, left: Math.round((w - logoSize) / 2), top: Math.round((h - logoSize) / 2) }])
    .png()
    .toBuffer();
}

for (const { dir, port, land } of splashDensities) {
  const dest = join(resDir, dir);
  mkdirSync(dest, { recursive: true });
  if (port) {
    const buf = await makeSplash(port[0], port[1]);
    if (dir === 'drawable') {
      // Only write splash.png if splash.xml doesn't need it; skip to avoid conflict
      // The splash.xml in drawable/ takes precedence over splash.png
    } else {
      const { writeFileSync } = await import('fs');
      writeFileSync(join(dest, 'splash.png'), buf);
      console.log(`${dir}/splash.png ${port[0]}x${port[1]}`);
    }
  }
  if (land) {
    const buf = await makeSplash(land[0], land[1]);
    const { writeFileSync } = await import('fs');
    writeFileSync(join(dest, 'splash.png'), buf);
    console.log(`${dir}/splash.png ${land[0]}x${land[1]}`);
  }
}
