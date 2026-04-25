import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconSrc   = join(root, 'src/assets/crewsync-logo-icon.jpg');
const fullSrc   = join(root, 'src/assets/crewsync-logo-full.jpg');
const iconDir   = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const splashDir = join(root, 'ios/App/App/Assets.xcassets/Splash.imageset');

mkdirSync(iconDir,   { recursive: true });
mkdirSync(splashDir, { recursive: true });

/**
 * Navy logo on white background — no color manipulation.
 * Source already has correct colors (dark navy logo on white).
 * Resize with contain at 80% of total size, white padding fills the rest.
 */
async function makeIconPng(srcPath, totalPx, logoFraction = 0.80) {
  const logoPx = Math.round(totalPx * logoFraction);

  const logoBuf = await sharp(srcPath)
    .resize(logoPx, logoPx, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: { width: totalPx, height: totalPx, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png({ compressionLevel: 9 });
}

// ── App Icons ─────────────────────────────────────────────────────────────────

const sizes = [
  { size: 20,   scale: 1, name: 'Icon-20.png' },
  { size: 20,   scale: 2, name: 'Icon-20@2x.png' },
  { size: 20,   scale: 3, name: 'Icon-20@3x.png' },
  { size: 29,   scale: 1, name: 'Icon-29.png' },
  { size: 29,   scale: 2, name: 'Icon-29@2x.png' },
  { size: 29,   scale: 3, name: 'Icon-29@3x.png' },
  { size: 40,   scale: 1, name: 'Icon-40.png' },
  { size: 40,   scale: 2, name: 'Icon-40@2x.png' },
  { size: 40,   scale: 3, name: 'Icon-40@3x.png' },
  { size: 60,   scale: 2, name: 'Icon-60@2x.png' },
  { size: 60,   scale: 3, name: 'Icon-60@3x.png' },
  { size: 76,   scale: 1, name: 'Icon-76.png' },
  { size: 76,   scale: 2, name: 'Icon-76@2x.png' },
  { size: 83.5, scale: 2, name: 'Icon-83.5@2x.png' },
  { size: 1024, scale: 1, name: 'Icon-1024.png' },
  { size: 512,  scale: 2, name: 'AppIcon-512@2x.png' },
];

for (const { size, scale, name } of sizes) {
  const px = Math.round(size * scale);
  const pipeline = await makeIconPng(iconSrc, px, 0.80);
  await pipeline.toFile(join(iconDir, name));
  console.log(`✓ ${name} (${px}×${px})`);
}

const contents = {
  images: [
    { idiom: 'iphone', scale: '2x', size: '20x20',     filename: 'Icon-20@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '20x20',     filename: 'Icon-20@3x.png' },
    { idiom: 'iphone', scale: '2x', size: '29x29',     filename: 'Icon-29@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '29x29',     filename: 'Icon-29@3x.png' },
    { idiom: 'iphone', scale: '2x', size: '40x40',     filename: 'Icon-40@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '40x40',     filename: 'Icon-40@3x.png' },
    { idiom: 'iphone', scale: '2x', size: '60x60',     filename: 'Icon-60@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '60x60',     filename: 'Icon-60@3x.png' },
    { idiom: 'ipad',   scale: '1x', size: '20x20',     filename: 'Icon-20.png' },
    { idiom: 'ipad',   scale: '2x', size: '20x20',     filename: 'Icon-20@2x.png' },
    { idiom: 'ipad',   scale: '1x', size: '29x29',     filename: 'Icon-29.png' },
    { idiom: 'ipad',   scale: '2x', size: '29x29',     filename: 'Icon-29@2x.png' },
    { idiom: 'ipad',   scale: '1x', size: '40x40',     filename: 'Icon-40.png' },
    { idiom: 'ipad',   scale: '2x', size: '40x40',     filename: 'Icon-40@2x.png' },
    { idiom: 'ipad',   scale: '1x', size: '76x76',     filename: 'Icon-76.png' },
    { idiom: 'ipad',   scale: '2x', size: '76x76',     filename: 'Icon-76@2x.png' },
    { idiom: 'ipad',   scale: '2x', size: '83.5x83.5', filename: 'Icon-83.5@2x.png' },
    { idiom: 'ios-marketing', scale: '1x', size: '1024x1024', filename: 'Icon-1024.png' },
  ],
  info: { author: 'xcode', version: 1 },
};

writeFileSync(join(iconDir, 'Contents.json'), JSON.stringify(contents, null, 2));
console.log('✓ Contents.json');

// ── Splash Screen ─────────────────────────────────────────────────────────────

const SPLASH_SIZE = 2732;

await sharp(fullSrc)
  .resize(Math.round(SPLASH_SIZE * 0.55), Math.round(SPLASH_SIZE * 0.35), {
    fit: 'contain',
    background: { r: 10, g: 22, b: 40 },
  })
  .flatten({ background: { r: 10, g: 22, b: 40 } })
  .png()
  .toBuffer()
  .then(async (logoBuf) => {
    await sharp({
      create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 3, background: { r: 10, g: 22, b: 40 } },
    })
      .composite([{ input: logoBuf, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toFile(join(splashDir, 'Splash.png'));
  });

console.log(`✓ Splash.png (${SPLASH_SIZE}×${SPLASH_SIZE})`);

const splashContents = {
  images: [
    { filename: 'Splash.png', idiom: 'universal', scale: '1x' },
    { idiom: 'universal', scale: '2x' },
    { idiom: 'universal', scale: '3x' },
  ],
  info: { author: 'xcode', version: 1 },
};
writeFileSync(join(splashDir, 'Contents.json'), JSON.stringify(splashContents, null, 2));
console.log('✓ Splash Contents.json');
