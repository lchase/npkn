// Desktop shell. This is deliberately thin: it opens a window onto the same built app the browser
// serves. No app logic lives here, and the renderer gets no Node access.
const { app, BrowserWindow, protocol, net, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const notebook = require('./notebook.cjs')

// Same name in dev and packaged builds, so both read the same userData (notes, window state).
app.setName('npkn')
// Lets tests (and curious people) run against a throwaway profile instead of the real one.
if (process.env.NPKN_USER_DATA) app.setPath('userData', process.env.NPKN_USER_DATA)

const DIST = path.join(__dirname, '..', 'dist')
// When set (npm run desktop:dev), load the Vite dev server instead of the built files.
const DEV_URL = process.env.NPKN_DEV_URL
const ORIGIN = 'app://npkn'

// A real, secure origin for the built app (instead of file://), so IndexedDB, fetch and CORS
// behave like a normal site. Ollama allows app:// origins by default.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    return {}
  }
}

function saveBounds(win) {
  if (win.isMinimized() || win.isFullScreen()) return
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(win.getBounds()))
  } catch {
    /* non-fatal */
  }
}

const isHttp = url => /^https?:\/\//i.test(url)

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 480,
    title: 'npkn',
    // Window icon for Windows/Linux; on macOS the app bundle's icon is used.
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    ...loadBounds(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Test switch: run the app as a plain browser would (no notebook bridge) to exercise browser mode.
      additionalArguments: process.env.NPKN_NO_NOTEBOOK ? ['--npkn-no-notebook'] : [],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.on('resized', () => saveBounds(win))
  win.on('moved', () => saveBounds(win))

  // Links in notes open in the real browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const inApp = url.startsWith(ORIGIN) || (DEV_URL && url.startsWith(DEV_URL))
    if (!inApp) {
      event.preventDefault()
      if (isHttp(url)) shell.openExternal(url)
    }
  })

  win.loadURL(DEV_URL || `${ORIGIN}/index.html`)
  return win
}

function serveDist() {
  protocol.handle('app', request => {
    let rel = decodeURIComponent(new URL(request.url).pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = path.normalize(path.join(DIST, rel))
    // Refuse anything that resolves outside dist/.
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 })
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html')
    return net.fetch(pathToFileURL(target).toString())
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // Unpackaged runs (npm run desktop) would otherwise show the stock Electron icon in the Dock.
    if (process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, 'icon.png'))
    notebook.register()
    if (!DEV_URL) {
      if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        console.error('dist/ is missing. Run `npm run build` first (or use `npm run desktop`).')
        app.quit()
        return
      }
      serveDist()
    }
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
