// Makes sure the Electron binary is present. npm 12 skips install scripts by default, and Electron's
// own extractor can fail silently on very new Node versions, so fall back to unzipping the cached
// download by hand. Safe to run repeatedly.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const pkg = path.join(root, 'node_modules', 'electron')
const marker = path.join(pkg, 'path.txt')

const ready = () => fs.existsSync(marker) && fs.existsSync(path.join(pkg, 'dist'))
if (ready()) process.exit(0)

const run = () => execFileSync('node', [path.join(pkg, 'install.js')], { stdio: 'inherit' })
try {
  run()
} catch (e) {
  console.error('electron install.js failed:', e.message)
}
if (ready() && fs.readdirSync(path.join(pkg, 'dist')).length > 2) process.exit(0)

const version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron')
const zip = fs.existsSync(cacheRoot)
  ? fs
      .readdirSync(cacheRoot)
      .map(d => path.join(cacheRoot, d, `electron-v${version}-darwin-${arch}.zip`))
      .find(fs.existsSync)
  : undefined

if (!zip) {
  console.error('Electron binary not found. Run: node node_modules/electron/install.js')
  process.exit(1)
}
fs.rmSync(path.join(pkg, 'dist'), { recursive: true, force: true })
fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true })
execFileSync('unzip', ['-q', zip, '-d', path.join(pkg, 'dist')], { stdio: 'inherit' })
fs.writeFileSync(marker, 'Electron.app/Contents/MacOS/Electron')
fs.writeFileSync(path.join(pkg, 'dist', 'version'), version)
console.log('Electron ready:', version)
