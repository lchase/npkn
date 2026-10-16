import { db } from './db'
import type { NotebookBridge } from './desktop'
import { FsaNotebook } from './fsaNotebook'

/**
 * The notebook-folder bridge for a plain browser, on the File System Access API (Chromium only).
 *
 * Two things differ from the desktop app:
 *  - Access doesn't survive a reload by itself. The folder handle is remembered in IndexedDB, but the
 *    browser usually wants the user to re-grant permission, which must happen from a click. Until then
 *    get() reports needsPermission and the UI offers "Reconnect".
 *  - There is no file watching, so changes are detected by polling while the tab is visible, and
 *    immediately when it regains focus. A scan only reads files whose mtime changed, so it's cheap.
 */

export const browserNotebookSupported = () => typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function'

const KEY = 'notebook'
const POLL_MS = 3000
const OPTS = { mode: 'readwrite' } as const

type Handle = FileSystemDirectoryHandle & {
  queryPermission(o: typeof OPTS): Promise<PermissionState>
  requestPermission(o: typeof OPTS): Promise<PermissionState>
}

let pending: Handle | null = null // picked, not yet confirmed
let ops: FsaNotebook | null = null
let opsHandle: Handle | null = null

async function stored() {
  return db.handles.get(KEY)
}

async function granted(h: Handle, ask: boolean): Promise<boolean> {
  try {
    if ((await h.queryPermission(OPTS)) === 'granted') return true
    return ask ? (await h.requestPermission(OPTS)) === 'granted' : false
  } catch {
    return false
  }
}

/** Operations bound to the remembered folder, or throws if there isn't one with permission. */
async function active(): Promise<FsaNotebook> {
  const row = await stored()
  if (!row) throw new Error('No notebook folder')
  const h = row.handle as Handle
  if (!(await granted(h, false))) throw new Error('Permission to the notebook folder was not granted')
  if (!ops || opsHandle !== h) {
    ops = new FsaNotebook(h)
    opsHandle = h
  }
  return ops
}

export function createBrowserNotebook(): NotebookBridge {
  return {
    async get() {
      const row = await stored()
      if (!row) return { root: null }
      const ok = await granted(row.handle as Handle, false)
      return { root: row.name, id: row.id, needsPermission: !ok }
    },

    // The picker needs a user gesture, so this must be called straight from a click handler.
    async choose() {
      try {
        pending = (await (window as any).showDirectoryPicker({ id: 'npkn-notebook', mode: 'readwrite' })) as Handle
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return null
        throw e
      }
      return { root: pending.name }
    },

    async set() {
      if (!pending) throw new Error('Choose a folder first')
      const h = pending
      pending = null
      await db.handles.put({ key: KEY, id: crypto.randomUUID(), name: h.name, handle: h })
      ops = null
      return { root: h.name }
    },

    async clear() {
      await db.handles.delete(KEY)
      ops = null
      return { root: null }
    },

    async reconnect() {
      const row = await stored()
      return row ? granted(row.handle as Handle, true) : false
    },

    async scan(known) {
      return (await active()).scan(known)
    },
    async write(path, text, opts) {
      return (await active()).write(path, text, opts)
    },
    async move(from, to) {
      return (await active()).move(from, to)
    },
    async trash(path) {
      return (await active()).trash(path)
    },

    onChange(cb) {
      const tick = () => {
        if (document.visibilityState === 'visible') cb()
      }
      const timer = window.setInterval(tick, POLL_MS)
      window.addEventListener('focus', tick)
      document.addEventListener('visibilitychange', tick)
      return () => {
        window.clearInterval(timer)
        window.removeEventListener('focus', tick)
        document.removeEventListener('visibilitychange', tick)
      }
    },
  }
}
