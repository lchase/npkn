// The notebook folder: the only part of the app that touches the disk.
//
// The renderer asks for operations by RELATIVE path; every path is resolved against the chosen root
// and refused if it escapes it, starts a hidden segment, or isn't a markdown file. Nothing here is
// exposed except through the narrow preload bridge.
const { app, dialog, ipcMain, BrowserWindow } = require('electron')
const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')

const configFile = () => path.join(app.getPath('userData'), 'notebook.json')
const MD = /\.(md|markdown)$/i

let root = null
let watcher = null
let timer = null

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'))
  } catch {
    return {}
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(cfg))
}

/** Resolve a renderer-supplied relative path to an absolute one inside root, or throw. */
function inside(rel, { markdownOnly = true } = {}) {
  if (!root) throw new Error('No notebook folder')
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.includes('\0')) throw new Error('Bad path')
  const parts = rel.split('/')
  if (parts.some(s => s === '' || s === '.' || s === '..' || s.startsWith('.'))) throw new Error('Bad path')
  if (markdownOnly && !MD.test(rel)) throw new Error('Not a markdown file')
  const abs = path.resolve(root, rel)
  if (!abs.startsWith(root + path.sep)) throw new Error('Path escapes the notebook')
  return abs
}

async function walk(dir, rel = '') {
  const out = []
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const childRel = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), childRel)))
    else if (e.isFile() && MD.test(e.name)) out.push(childRel)
  }
  return out
}

/** Remove now-empty directories upward from `dir`, never touching root itself. */
async function prune(dir) {
  let cur = dir
  while (cur.startsWith(root + path.sep)) {
    try {
      await fsp.rmdir(cur) // fails (harmlessly) if not empty
    } catch {
      return
    }
    cur = path.dirname(cur)
  }
}

function stopWatching() {
  if (watcher) watcher.close()
  watcher = null
  clearTimeout(timer)
}

function startWatching() {
  stopWatching()
  if (!root) return
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      const name = filename ? String(filename) : ''
      if (name.split(path.sep).some(s => s.startsWith('.')) || name.includes('.tmp-')) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('notebook:changed')
      }, 300)
    })
    watcher.on('error', () => {})
  } catch {
    /* watching is a convenience; scans still work */
  }
}

function setRoot(dir) {
  root = dir ? path.resolve(dir) : null
  const cfg = loadConfig()
  if (root) cfg.root = root
  else delete cfg.root
  saveConfig(cfg)
  startWatching()
}

function register() {
  // NPKN_NOTEBOOK pins a folder (tests, scripts). Otherwise use the saved choice.
  const fromEnv = process.env.NPKN_NOTEBOOK
  root = fromEnv ? path.resolve(fromEnv) : loadConfig().root ?? null
  if (root) {
    fs.mkdirSync(root, { recursive: true })
    startWatching()
  }

  ipcMain.handle('notebook:get', () => ({ root }))

  ipcMain.handle('notebook:choose', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a notebook folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Use this folder',
    })
    return r.canceled || !r.filePaths[0] ? null : { root: r.filePaths[0] }
  })

  ipcMain.handle('notebook:set', (_e, dir) => {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('Bad folder')
    fs.mkdirSync(dir, { recursive: true })
    setRoot(dir)
    return { root }
  })

  ipcMain.handle('notebook:clear', () => {
    setRoot(null)
    return { root: null }
  })

  // known: { relPath: mtimeMs }. Text is only sent for files whose mtime differs, so a rescan of a
  // large unchanged notebook is cheap.
  ipcMain.handle('notebook:scan', async (_e, known = {}) => {
    if (!root) return { root: null, files: [] }
    const rels = await walk(root)
    const files = []
    for (const rel of rels) {
      const abs = path.join(root, rel)
      try {
        const st = await fsp.stat(abs)
        const entry = { path: rel, mtimeMs: st.mtimeMs }
        if (known[rel] !== st.mtimeMs) entry.text = await fsp.readFile(abs, 'utf8')
        files.push(entry)
      } catch {
        /* vanished mid-scan; next scan will settle it */
      }
    }
    return { root, files }
  })

  // Write atomically (temp file then rename) so a crash or a sync client never sees a half file.
  //
  // opts.expect guards against clobbering: null means "must not exist yet", a number means "must still
  // have the mtime we last saw". If the disk has moved on, refuse; the caller re-scans and merges.
  ipcMain.handle('notebook:write', async (_e, rel, text, opts) => {
    const abs = inside(rel)
    if (typeof text !== 'string') throw new Error('Bad content')

    let existing = null
    try {
      existing = await fsp.stat(abs)
    } catch {
      /* new file */
    }
    if (opts && 'expect' in opts) {
      if (opts.expect === null && existing) throw new Error('EXISTS')
      if (typeof opts.expect === 'number' && existing && existing.mtimeMs !== opts.expect) throw new Error('CHANGED')
    }

    await fsp.mkdir(path.dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp-${process.pid}`
    await fsp.writeFile(tmp, text, 'utf8')
    await fsp.rename(tmp, abs)
    const st = await fsp.stat(abs)
    return { mtimeMs: st.mtimeMs }
  })

  ipcMain.handle('notebook:move', async (_e, from, to) => {
    const a = inside(from)
    const b = inside(to)
    if (a === b) return null
    try {
      await fsp.access(a)
    } catch {
      return null
    }
    let taken = true
    try {
      await fsp.access(b)
    } catch {
      taken = false
    }
    if (taken) throw new Error('EXISTS: destination already exists')
    await fsp.mkdir(path.dirname(b), { recursive: true })
    await fsp.rename(a, b)
    await prune(path.dirname(a))
    return { mtimeMs: (await fsp.stat(b)).mtimeMs }
  })

  // Deleting a page moves its file to .trash/ rather than unlinking it.
  ipcMain.handle('notebook:trash', async (_e, rel) => {
    const abs = inside(rel)
    try {
      await fsp.access(abs)
    } catch {
      return false
    }
    const dir = path.join(root, '.trash')
    await fsp.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await fsp.rename(abs, path.join(dir, `${stamp}-${path.basename(abs)}`))
    await prune(path.dirname(abs))
    return true
  })
}

module.exports = { register }
