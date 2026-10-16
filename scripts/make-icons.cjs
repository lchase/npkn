// Generates every app icon from one design, so web and desktop can't drift apart.
//
//   npm run icons
//
// Runs under Electron (not node) because it needs a real renderer to rasterise the SVG with proper
// transparency. Writes:
//   public/   favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png,
//             icon-maskable-512.png
//   desktop/  icon.svg, icon.png (1024), icon.icns (macOS)
//
// The design is a napkin note: a cream square folded on the diagonal into a diamond, a perforation
// line across the middle and a terracotta ink mark (the theme's accent). The product is notes and
// knowledge; the assistant character lives inside the app and is deliberately NOT the app icon. It is
// text-free so it survives a rename. Edit the mark below and re-run.

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const DESKTOP = path.join(ROOT, 'desktop')

// ---- the mark (drawn on a 1024 canvas, page centred near 512,512) ---------------------------------

// A diamond 660 across, centred on 512,512. The top-right quarter is the folded-back flap.
const DIAMOND = 'M512 182 L842 512 L512 842 L182 512 Z'
const FLAP = 'M512 182 L842 512 L512 512 Z'

const DEFS = `
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3040"/><stop offset="1" stop-color="#14151c"/></linearGradient>
  <linearGradient id="paper" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="#f0e8d6"/><stop offset="1" stop-color="#e4d6b8"/></linearGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0876a"/><stop offset="1" stop-color="#d4533a"/></linearGradient>
  <filter id="lift" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity="0.38"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/></filter>`

/** The note. `detail` drops the perforation and crease for tiny sizes where they only add mud. */
const mark = (detail = true) => `
  <g filter="url(#soft)"><path d="${DIAMOND}" fill="url(#paper)"/></g>
  <path d="${FLAP}" fill="#c9b78f" opacity="0.55"/>
  ${
    detail
      ? `<path d="M512 512 V842" stroke="#a89873" stroke-opacity="0.45" stroke-width="4"/>
  <path d="M182 512 H842" stroke="#a89873" stroke-opacity="0.55" stroke-width="6" stroke-dasharray="14 12"/>
  <g fill="#a89873" opacity="0.5"><circle cx="257" cy="512" r="9"/><circle cx="333" cy="512" r="9"/><circle cx="409" cy="512" r="9"/><circle cx="690" cy="512" r="9"/><circle cx="767" cy="512" r="9"/></g>`
      : ''
  }
  <rect x="-81" y="-34" width="162" height="68" rx="3" fill="url(#ink)" transform="translate(544 594) rotate(45)"/>
  <path d="M438 554 L457 568 L431 593 Z" fill="#fff"/>`

const place = (content, scale) => `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${content}</g>`
const svg = (viewBox, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1024" height="1024"><defs>${DEFS}</defs>${inner}</svg>`

const SVGS = {
  // Browser tab and any place that wants the bare mark on a transparent background.
  favicon: svg('150 150 724 724', mark(false)),
  // macOS app icon: Apple's grid is an ~824px tile centred on 1024, with room for the system shadow.
  app: svg(
    '0 0 1024 1024',
    `<g filter="url(#lift)"><rect x="100" y="100" width="824" height="824" rx="188" fill="url(#tile)"/>` +
      `<rect x="101" y="101" width="822" height="822" rx="187" fill="none" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/></g>` +
      place(mark(true), 0.9),
  ),
  // iOS and PWA "any": a full-bleed square. The OS applies its own rounding.
  square: svg('0 0 1024 1024', `<rect width="1024" height="1024" fill="url(#tile)"/>` + place(mark(true), 0.95)),
  // Android adaptive icons crop to a circle/squircle: keep the mark inside the central 60%.
  maskable: svg('0 0 1024 1024', `<rect width="1024" height="1024" fill="url(#tile)"/>` + place(mark(true), 0.85)),
}

// ---- rasterise -----------------------------------------------------------------------------------

let tmpDir
let win

/**
 * Rasterise an SVG to a PNG with real transparency.
 *
 * Transparent and hidden windows won't load under every Electron build, so instead of asking for a
 * transparent capture we render the SVG on black and on white and recover alpha from the difference:
 * on black a pixel is a*C, on white it is a*C + (1-a)*255, so a = 1 - (white-black)/255 and C = black/a.
 * Exact for anti-aliased edges and shadows, not just fully on/off pixels.
 */
async function render(svgText, size) {
  tmpDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'npkn-icons-'))
  win ??= new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } })

  const stem = path.join(tmpDir, `i-${size}-${Math.abs(hash(svgText))}`)
  fs.writeFileSync(stem + '.svg', svgText)

  const grab = async color => {
    fs.writeFileSync(
      `${stem}-${color}.html`,
      `<!doctype html><html><body style="margin:0;overflow:hidden;background:${color}"><img width="${size}" height="${size}" style="display:block" src="${path.basename(stem)}.svg"></body></html>`,
    )
    await win.loadFile(`${stem}-${color}.html`)
    await new Promise(r => setTimeout(r, 250))
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
    if (img.getSize().width !== size) img = img.resize({ width: size, height: size, quality: 'best' })
    return img.toBitmap()
  }

  const onBlack = await grab('#000')
  const onWhite = await grab('#fff')
  const out = Buffer.alloc(onBlack.length)
  for (let i = 0; i < onBlack.length; i += 4) {
    const diff = (onWhite[i] - onBlack[i] + (onWhite[i + 1] - onBlack[i + 1]) + (onWhite[i + 2] - onBlack[i + 2])) / 3
    const alpha = Math.min(1, Math.max(0, 1 - diff / 255))
    for (let c = 0; c < 3; c++) out[i + c] = alpha > 0.003 ? Math.min(255, Math.round(onBlack[i + c] / alpha)) : 0
    out[i + 3] = Math.round(alpha * 255)
  }
  return require('electron').nativeImage.createFromBitmap(out, { width: size, height: size }).toPNG()
}

const hash = str => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)

/** A multi-size .ico made of PNG entries (supported since Windows Vista and by every browser). */
function ico(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dirs = entries.map(({ size, png }) => {
    const d = Buffer.alloc(16)
    d.writeUInt8(size >= 256 ? 0 : size, 0)
    d.writeUInt8(size >= 256 ? 0 : size, 1)
    d.writeUInt16LE(1, 4)
    d.writeUInt16LE(32, 6)
    d.writeUInt32LE(png.length, 8)
    d.writeUInt32LE(offset, 12)
    offset += png.length
    return d
  })
  return Buffer.concat([head, ...dirs, ...entries.map(e => e.png)])
}

const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
  console.log('  wrote', path.relative(ROOT, file), `(${data.length} bytes)`)
}

async function main() {
  console.log('Rendering icons…')

  // Web
  write(path.join(PUBLIC, 'favicon.svg'), SVGS.favicon)
  const fav = {}
  for (const s of [16, 32, 48]) fav[s] = await render(SVGS.favicon, s)
  write(path.join(PUBLIC, 'favicon.ico'), ico([16, 32, 48].map(size => ({ size, png: fav[size] }))))
  write(path.join(PUBLIC, 'apple-touch-icon.png'), await render(SVGS.square, 180))
  write(path.join(PUBLIC, 'icon-192.png'), await render(SVGS.square, 192))
  write(path.join(PUBLIC, 'icon-512.png'), await render(SVGS.square, 512))
  write(path.join(PUBLIC, 'icon-maskable-512.png'), await render(SVGS.maskable, 512))

  // Desktop
  write(path.join(DESKTOP, 'icon.svg'), SVGS.app)
  const master = await render(SVGS.app, 1024)
  write(path.join(DESKTOP, 'icon.png'), master)

  if (process.platform === 'darwin') {
    const set = path.join(os.tmpdir(), `npkn-${process.pid}.iconset`)
    fs.mkdirSync(set, { recursive: true })
    for (const [name, px] of [
      ['icon_16x16', 16], ['icon_16x16@2x', 32], ['icon_32x32', 32], ['icon_32x32@2x', 64],
      ['icon_128x128', 128], ['icon_128x128@2x', 256], ['icon_256x256', 256], ['icon_256x256@2x', 512],
      ['icon_512x512', 512], ['icon_512x512@2x', 1024],
    ]) {
      fs.writeFileSync(path.join(set, `${name}.png`), px === 1024 ? master : await render(SVGS.app, px))
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(DESKTOP, 'icon.icns')])
    fs.rmSync(set, { recursive: true, force: true })
    console.log('  wrote desktop/icon.icns')
  }

  // Sanity: the corners of the app icon must be transparent, or the Dock shows a black square.
  const { nativeImage } = require('electron')
  const px = nativeImage.createFromBuffer(master).toBitmap()
  const alphaCorner = px[3]
  win?.destroy()
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  console.log(alphaCorner === 0 ? '  ok: app icon corners are transparent' : `  WARNING: corner alpha is ${alphaCorner}`)
}

app.dock?.hide()
app.whenReady().then(main).then(() => app.quit()).catch(e => {
  console.error(e)
  app.exit(1)
})
