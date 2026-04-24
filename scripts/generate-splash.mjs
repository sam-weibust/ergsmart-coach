import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src/assets/crewsync-logo-icon.jpg');

// Generate a 1366x1366 splash image: navy background + centered logo at 512px
const logoSize = 512;
const canvasSize = 1366;
const offset = Math.round((canvasSize - logoSize) / 2);

const logoBuffer = await sharp(src)
  .resize(logoSize, logoSize, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: canvasSize,
    height: canvasSize,
    channels: 4,
    background: { r: 10, g: 22, b: 40, alpha: 1 },
  },
})
  .composite([{ input: logoBuffer, left: offset, top: offset }])
  .png()
  .toFile(join(root, 'ios/App/App/Assets.xcassets/Splash.imageset/Splash.png'));

console.log(`Generated Splash.png (${canvasSize}x${canvasSize})`);
