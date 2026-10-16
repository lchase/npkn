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
// The design is a note: a coral page with a folded corner, lines of text, and a label chip (the app's
// own @label pill). The product is notes and knowledge; the assistant character lives inside the app
// and is deliberately NOT the app icon. It is text-free so it survives a rename. Edit the mark below
// and re-run.

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const DESKTOP = path.join(ROOT, 'desktop')

// ---- the mark (drawn on a 1024 canvas, page centred near 512,512) ---------------------------------

// A page with its top-right corner folded: 484 wide, 664 tall, 48px corners, 150px fold.
const PAGE = 'M318 180 H604 L754 330 V796 a48 48 0 0 1 -48 48 H318 a48 48 0 0 1 -48 -48 V228 a48 48 0 0 1 48 -48 Z'
const FOLD = 'M604 180 V282 a48 48 0 0 0 48 48 H754 Z'

const DEFS = `
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3040"/><stop offset="1" stop-color="#14151c"/></linearGradient>
  <linearGradient id="page" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ff9277"/><stop offset="0.5" stop-color="#ff6b4a"/><stop offset="1" stop-color="#d9482b"/></linearGradient>
  <filter id="lift" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity="0.38"/></filter>`

/** The note. `detail` drops the gloss and ground shadow for tiny sizes where they only add mud. */
const mark = (detail = true) => `
  ${detail ? '<ellipse cx="512" cy="872" rx="238" ry="26" fill="#000" opacity="0.26"/>' : ''}
  <path d="${PAGE}" fill="#a8331d" transform="translate(0 26)"/>
  <path d="${PAGE}" fill="url(#page)"/>
  <path d="${FOLD}" fill="#ffe3d9"/>
  <path d="${FOLD}" fill="#000" opacity="0.1"/>
  <g fill="#fff">
    <rect x="344" y="470" width="336" height="48" rx="24"/>
    <rect x="344" y="588" width="336" height="48" rx="24"/>
    <rect x="344" y="706" width="206" height="48" rx="24"/>
  </g>
  <!-- the label chip: the app's own @label pill, sitting on the first line -->
  <rect x="344" y="388" width="170" height="58" rx="29" fill="#14b8a6"/>
  <circle cx="378" cy="417" r="10" fill="#fff"/>`

const place = (content, scale) => `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${content}</g>`
const svg = (viewBox, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1024" height="1024"><defs>${DEFS}</defs>${inner}</svg>`

const SVGS = {
  // Browser tab and any place that wants the bare mark on a transparent background.
  favicon: svg('215 130 594 780', mark(true)),
  // macOS app icon: Apple's grid is an ~824px tile centred on 1024, with room for the system shadow.
  app: svg(
    '0 0 1024 1024',
    `<g filter="url(#lift)"><rect x="100" y="100" width="824" height="824" rx="188" fill="url(#tile)"/>` +
      `<rect x="101" y="101" width="822" height="822" rx="187" fill="none" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/></g>` +
      place(mark(true), 0.92),
  ),
  // iOS and PWA "any": a full-bleed square. The OS applies its own rounding.
  square: svg('0 0 1024 1024', `<rect width="1024" height="1024" fill="url(#tile)"/>` + place(mark(true), 0.9)),
  // Android adaptive icons crop to a circle/squircle: keep the character inside the central 60%.
  maskable: svg('0 0 1024 1024', `<rect width="1024" height="1024" fill="url(#tile)"/>` + place(mark(true), 0.7)),
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
  win ??= new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, webPreferences: { offscreen: true } })

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
