// One-off icon rasterizer: public/icon.svg -> PNGs. Run: node scripts/gen-icons.mjs
// Requires sharp (installed with `npm install --no-save sharp`).
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg  = readFileSync(join(root, 'public', 'icon.svg'))
const out  = (name) => join(root, 'public', name)

// icon.svg already carries its own rounded #243b55 background.
await sharp(svg, { density: 384 }).resize(192, 192).png().toFile(out('icon-192.png'))
await sharp(svg, { density: 384 }).resize(96, 96).png().toFile(out('notification-icon.png'))

// 512 maskable: flatten onto a full solid square so corners are filled.
await sharp(svg, { density: 512 })
  .resize(512, 512)
  .flatten({ background: '#243b55' })
  .png()
  .toFile(out('icon-512.png'))

console.log('Generated icon-192.png, icon-512.png, notification-icon.png')
