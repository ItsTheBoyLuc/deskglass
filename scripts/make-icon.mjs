// Generates resources/icon.png (256) and build/icon.ico (16..256) with zero dependencies.
// Design: 2x2 glass tiles on a dark rounded square (a "widgets" mark).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const SIZES = [16, 24, 32, 48, 64, 128, 256]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const png = (size, rgba) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// Signed distance to a rounded box centred at (cx,cy) with half-size h and radius r (unit square coords).
const sdBox = (x, y, cx, cy, h, r) => {
  const dx = Math.abs(x - cx) - (h - r)
  const dy = Math.abs(y - cy) - (h - r)
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
}

const render = (size) => {
  const out = Buffer.alloc(size * size * 4)
  const SS = 4
  const tiles = [[0.31, 0.31], [0.69, 0.31], [0.31, 0.69], [0.69, 0.69]]
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          if (sdBox(x, y, 0.5, 0.5, 0.5, 0.22) > 0) continue
          // background: deep blue-grey gradient
          let cr = 18 + 22 * y, cg = 24 + 26 * y, cb = 44 + 40 * y
          for (const [tx, ty] of tiles) {
            if (sdBox(x, y, tx, ty, 0.15, 0.06) <= 0) {
              const t = (y - (ty - 0.15)) / 0.3
              const k = 0.55 - 0.3 * t // glassy: lighter at top
              cr = cr + (96 - cr) * k
              cg = cg + (205 - cg) * k
              cb = cb + (255 - cb) * k
            }
          }
          r += cr; g += cg; b += cb; a += 1
        }
      }
      const i = (py * size + px) * 4
      out[i] = a ? r / a : 0
      out[i + 1] = a ? g / a : 0
      out[i + 2] = a ? b / a : 0
      out[i + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return out
}

const pngs = SIZES.map((s) => png(s, render(s)))

const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2) // type = icon
header.writeUInt16LE(SIZES.length, 4)
let offset = 6 + 16 * SIZES.length
const entries = SIZES.map((s, i) => {
  const e = Buffer.alloc(16)
  e[0] = s === 256 ? 0 : s
  e[1] = s === 256 ? 0 : s
  e.writeUInt16LE(1, 4) // planes
  e.writeUInt16LE(32, 6) // bpp
  e.writeUInt32LE(pngs[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  return e
})

mkdirSync('resources', { recursive: true })
mkdirSync('build', { recursive: true })
writeFileSync('resources/icon.png', pngs[pngs.length - 1])
writeFileSync('build/icon.ico', Buffer.concat([header, ...entries, ...pngs]))
console.log('icon written:', SIZES.join(','))
