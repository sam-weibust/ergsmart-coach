import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src/assets/crewsync-logo-icon.jpg');
const iconDir = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');

mkdirSync(iconDir, { recursive: true });

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
];

for (const { size, scale, name } of sizes) {
  const px = Math.round(size * scale);
  await sharp(src).resize(px, px).toFile(join(iconDir, name));
  console.log(`Generated ${name} (${px}x${px})`);
}

const contents = {
  images: [
    { idiom: 'iphone', scale: '2x', size: '20x20',   filename: 'Icon-20@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '20x20',   filename: 'Icon-20@3x.png' },
    { idiom: 'iphone', scale: '2x', size: '29x29',   filename: 'Icon-29@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '29x29',   filename: 'Icon-29@3x.png' },
    { idiom: 'iphone', scale: '2x', size: '40x40',   filename: 'Icon-40@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '40x40',   filename: 'Icon-40@3x.png' },
    { idiom: 'iphone', scale: '2x', size: '60x60',   filename: 'Icon-60@2x.png' },
    { idiom: 'iphone', scale: '3x', size: '60x60',   filename: 'Icon-60@3x.png' },
    { idiom: 'ipad',   scale: '1x', size: '20x20',   filename: 'Icon-20.png' },
    { idiom: 'ipad',   scale: '2x', size: '20x20',   filename: 'Icon-20@2x.png' },
    { idiom: 'ipad',   scale: '1x', size: '29x29',   filename: 'Icon-29.png' },
    { idiom: 'ipad',   scale: '2x', size: '29x29',   filename: 'Icon-29@2x.png' },
    { idiom: 'ipad',   scale: '1x', size: '40x40',   filename: 'Icon-40.png' },
    { idiom: 'ipad',   scale: '2x', size: '40x40',   filename: 'Icon-40@2x.png' },
    { idiom: 'ipad',   scale: '1x', size: '76x76',   filename: 'Icon-76.png' },
    { idiom: 'ipad',   scale: '2x', size: '76x76',   filename: 'Icon-76@2x.png' },
    { idiom: 'ipad',   scale: '2x', size: '83.5x83.5', filename: 'Icon-83.5@2x.png' },
    { idiom: 'ios-marketing', scale: '1x', size: '1024x1024', filename: 'Icon-1024.png' },
  ],
  info: { author: 'xcode', version: 1 },
};

writeFileSync(join(iconDir, 'Contents.json'), JSON.stringify(contents, null, 2));
console.log('Written Contents.json');
