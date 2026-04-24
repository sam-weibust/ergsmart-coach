import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconSrc  = join(root, 'src/assets/crewsync-logo-icon.jpg');
const fullSrc  = join(root, 'src/assets/crewsync-logo-full.jpg');
const iconDir  = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const splashDir = join(root, 'ios/App/App/Assets.xcassets/Splash.imageset');

mkdirSync(iconDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

// Navy background colour (#0a1628)
const NAVY = { r: 10, g: 22, b: 40, alpha: 1 };

/**
 * Build a PNG with a white logo on a navy square.
 * Source images: dark-navy logo on white background (screenshots).
 *
 * Strategy:
 *  1. Resize logo with 'contain' into (logoFraction * totalPx) square.
 *  2. Greyscale → negate → threshold → single-channel greyscale PNG (mask).
 *     After this: logo pixels = 255 (opaque), background pixels = 0 (transparent).
 *  3. Create a solid-white RGB image of the same size.
 *  4. joinChannel(mask) → RGBA where alpha = mask → white logo, transparent background.
 *  5. Composite centred on navy square.
 */
async function makeIconPng(srcPath, totalPx, logoFraction = 0.6) {
  const logoPx = Math.round(totalPx * logoFraction);

  // Step 1+2: greyscale mask (1-channel PNG, logo=255 bg=0)
  const maskPng = await sharp(srcPath)
    .resize(logoPx, logoPx, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .grayscale()
    .negate()       // logo ~227 → dark; background ~7 → bright — wait, invert:
    // original: logo≈24 grey (dark), bg≈248 grey (light)
    // negate:   logo≈231 (bright), bg≈7 (dark)  ✓ logo is bright
    .threshold(80)  // logo≥80 → 255, background <80 → 0
    .png()
    .toBuffer();

  // Step 3: solid white RGB image same size
  const whiteRgb = await sharp({
    create: { width: logoPx, height: logoPx, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  // Step 4: join mask as alpha channel → RGBA white logo
  const whiteWithAlpha = await sharp(whiteRgb)
    .joinChannel(maskPng)  // mask becomes the 4th (alpha) channel
    .png()
    .toBuffer();

  // Step 5: composite on navy square
  return sharp({
    create: { width: totalPx, height: totalPx, channels: 4, background: NAVY },
  })
    .composite([{ input: whiteWithAlpha, gravity: 'center' }])
    .png({ compressionLevel: 9 });
}

// ── App Icons ────────────────────────────────────────────────────────────────

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
  // App Store / 512@2x alias
  { size: 512,  scale: 2, name: 'AppIcon-512@2x.png' },
];

for (const { size, scale, name } of sizes) {
  const px = Math.round(size * scale);
  const pipeline = await makeIconPng(iconSrc, px, 0.6);
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

// ── Splash Screen ────────────────────────────────────────────────────────────
// 2732×2732 covers all iPhone/iPad at @3x. Full wordmark centred at 55% width.

const SPLASH_SIZE = 2732;
const splashLogoW = Math.round(SPLASH_SIZE * 0.55);
// contain inside square region, keeping aspect ratio of wide logo
const splashLogoBox = Math.round(SPLASH_SIZE * 0.4); // height box limit

const splashMaskPng = await sharp(fullSrc)
  .resize(splashLogoW, splashLogoBox, {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .grayscale()
  .negate()
  .threshold(80)
  .png()
  .toBuffer();

// Get actual dimensions after resize
const splashMeta = await sharp(splashMaskPng).metadata();
const sw = splashMeta.width;
const sh = splashMeta.height;

const splashWhiteRgb = await sharp({
  create: { width: sw, height: sh, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .png()
  .toBuffer();

const splashLogoPng = await sharp(splashWhiteRgb)
  .joinChannel(splashMaskPng)
  .png()
  .toBuffer();

await sharp({
  create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background: NAVY },
})
  .composite([{ input: splashLogoPng, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(join(splashDir, 'Splash.png'));

console.log(`✓ Splash.png (${SPLASH_SIZE}×${SPLASH_SIZE}, logo ${sw}×${sh})`);

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
