import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "icon-source.svg");
const outDir = path.join(dir, "..", "public", "icons");

const sizes = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "maskable-512.png", size: 512 },
];

for (const { file, size } of sizes) {
  await sharp(src).resize(size, size).png().toFile(path.join(outDir, file));
  console.log(`Generated ${file}`);
}
