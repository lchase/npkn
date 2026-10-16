import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { fileLinkMapper, hasRelativeLinks, linkTargets, resolveRelativeLinks } from '../core/links'
import { buildNoteFile, conflictPath, parseNoteFile, planPaths, withId, type KnownEntry } from '../core/notefile'
import { browserNotebookSupported, createBrowserNotebook } from './browserNotebook'
import type { NotebookBridge } from './desktop'
import { db, type SyncRow } from './db'

/**
 * Keeps IndexedDB and a notebook folder of .md files in step.
 *
 * IndexedDB stays the working copy the UI reads (fast, reactive). The folder is the durable,
 * portable copy that other tools and clients can read. Two directions:
 *
 *   disk -> app   pull():  scan the folder, import new/changed files, drop files that were removed
 *   app  -> disk  flush(): write pages that changed since they were last synced, rename, trash
 *
 * Rules that keep notes safe:
 *  - A write never clobbers a file that changed on disk since we last saw it (see `expect`).
 *  - If both sides changed the same page, the app's version wins and the file's version is kept next
 *    to it as `*.conflict-<time>.md`. Nothing is dropped silently.
 *  - Deleting a page moves its file to `.trash/`; it is never unlinked.
 *  - A hand-written file only gains an `id:` line; its body isn't reformatted until it's edited here.
 */

type Known = SyncRow['known'][string]

export type SyncStatus = {
  state: 'unsupported' | 'off' | 'needs-permission' | 'syncing' | 'idle' | 'error'
  /** Where the bridge lives: the desktop app (real paths) or a browser folder grant. */
  mode?: 'desktop' | 'browser'
  root: string | null
  message?: string
  at?: number
}

const KEY = 'folder'
let browserBridge: NotebookBridge | undefined

/** The desktop app's bridge if there is one, otherwise the browser's, otherwise nothing. */
const bridge = (): NotebookBridge | undefined => {
  if (typeof window === 'undefined') return undefined
  if (window.npknDesktop?.notebook) return window.npknDesktop.notebook
  if (browserNotebookSupported()) return (browserBridge ??= createBrowserNotebook())
  return undefined
}
const modeOf = (): 'desktop' | 'browser' => (window.npknDesktop?.notebook ? 'desktop' : 'browser')

let status: SyncStatus = { state: bridge() ? 'off' : 'unsupported', root: null, mode: bridge() ? modeOf() : undefined }
const listeners = new Set<() => void>()
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch }
  listeners.forEach(l => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    cb => (listeners.add(cb), () => void listeners.delete(cb)),
    () => status,
  )
}

let root: string | null = null
let known = new Map<string, Known>()
let chain: Promise<unknown> = Promise.resolve()
let stopFs: (() => void) | undefined
let stopLive: (() => void) | undefined
let flushTimer: number | undefined

/** Serialise all sync work so a pull and a flush never interleave. Never rejects. */
function run(fn: () => Promise<void>): Promise<void> {
  const next = chain.then(async () => {
    setStatus({ state: 'syncing' })
    try {
      await fn()
      setStatus({ state: 'idle', message: undefined, at: Date.now() })
    } catch (e) {
      console.error('[folder sync]', e)
      setStatus({ state: 'error', message: (e as Error).message })
    }
  })
  chain = next
  return next
}

async function loadKnown(forRoot: string) {
  const row = await db.sync.get(KEY)
  known = row && row.root === forRoot ? new Map(Object.entries(row.known)) : new Map()
}

async function saveKnown() {
  if (!root) return
  await db.sync.put({ key: KEY, root, known: Object.fromEntries(known) })
}

const depth = (p: string) => p.split('/').length
const isConflict = (e: unknown) => /EXISTS|CHANGED/.test((e as Error)?.message ?? '')

// ---- disk -> app -------------------------------------------------------------------------------

async function pull() {
  const nb = bridge()!
  const mtimes: Record<string, number> = {}
  for (const k of known.values()) mtimes[k.path] = k.mtimeMs

  const { files } = await nb.scan(mtimes)
  const present = new Set(files.map(f => f.path))
  const pages = new Map((await db.pages.toArray()).map(p => [p.id, p]))
  const pathToId = new Map<string, string>()
  for (const [id, k] of known) pathToId.set(k.path, id)

  const changed = files
    .filter(f => f.text !== undefined)
    .sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path))
  const seen = new Set<string>()

  for (const f of changed) {
    const original = f.text as string
    const parsed = parseNoteFile(original, f.path.split('/').pop() ?? f.path)
    let id = parsed.id
    let mtimeMs = f.mtimeMs

    // A copied file carries its original's id. Give the copy its own rather than merging them.
    const owner = id ? known.get(id) : undefined
    if (id && (seen.has(id) || (owner && owner.path !== f.path && present.has(owner.path)))) id = null

    if (!id) {
      id = crypto.randomUUID()
      try {
        const r = await nb.write(f.path, withId(original, id), { expect: f.mtimeMs })
        mtimeMs = r.mtimeMs
      } catch {
        continue // changed again underneath us; the next scan picks it up
      }
    }
    seen.add(id)

    // Our own conflict copies are real pages; say so in the title so they're obvious in the sidebar.
    const isConflictCopy = /\.conflict-[\d-]+T[\d-]+\.md$/i.test(f.path)
    if (isConflictCopy && !/\(conflict copy\)$/.test(parsed.title)) parsed.title += ' (conflict copy)'

    const now = Date.now()
    const existing = pages.get(id)
    if (existing) {
      const k = known.get(id)
      const dirty = !!k && existing.updatedAt > k.synced
      if (dirty) {
        // Both sides changed. App wins (flush rewrites the file); keep the disk version beside it.
        try {
          await nb.write(conflictPath(f.path), original, { expect: null })
        } catch {
          /* a conflict copy for this second already exists */
        }
        // The disk version is safe in the copy now. Record that we've seen it, otherwise the app's
        // write below is refused as "changed" forever and the copy gets re-made every sync.
        known.set(id, { ...k!, mtimeMs })
        continue
      }
      known.set(id, { path: f.path, mtimeMs, synced: now, title: parsed.title, parentId: existing.parentId })
      pathToId.set(f.path, id)
      await db.pages.put({ ...existing, title: parsed.title, content: parsed.content, frontmatter: parsed.frontmatter, updatedAt: now })
    } else {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      const parentId = dir ? (pathToId.get(dir + '.md') ?? null) : null
      known.set(id, { path: f.path, mtimeMs, synced: isConflictCopy ? now - 1 : now, title: parsed.title, parentId })
      pathToId.set(f.path, id)
      await db.pages.put({
        id,
        parentId,
        title: parsed.title,
        content: parsed.content,
        frontmatter: parsed.frontmatter,
        createdAt: f.mtimeMs,
        updatedAt: now,
      })
    }
  }

  // Files that disappeared. Unless the page has unsynced edits (then flush recreates the file).
  for (const [id, k] of [...known]) {
    if (present.has(k.path)) continue
    const page = pages.get(id)
    if (!page) {
      known.delete(id)
      continue
    }
    if (page.updatedAt > k.synced) continue
    known.delete(id)
    await db.pages.delete(id)
  }

  // Now that every file has an id, turn relative `.md` links into links to pages. Anything that doesn't
  // resolve is left exactly as written, and is retried on later pulls (the target may arrive later).
  // updatedAt is deliberately not bumped: the file already says this, so it isn't an edit to write back.
  const idByPath = new Map<string, string>()
  for (const [id, k] of known) idByPath.set(k.path, id)
  for (const pg of await db.pages.toArray()) {
    const k = known.get(pg.id)
    if (!k || !pg.content || !hasRelativeLinks(pg.content, k.path)) continue
    const r = resolveRelativeLinks(pg.content, k.path, idByPath)
    if (r.changed) await db.pages.update(pg.id, { content: r.doc })
  }

  // A deleted parent shouldn't strand its children out of the tree.
  const all = await db.pages.toArray()
  const ids = new Set(all.map(p => p.id))
  for (const p of all) if (p.parentId && !ids.has(p.parentId)) await db.pages.update(p.id, { parentId: null })

  await saveKnown()
}

// ---- app -> disk -------------------------------------------------------------------------------

async function flush(attempt = 0): Promise<void> {
  const nb = bridge()!
  const pages = await db.pages.toArray()
  const byId = new Set(pages.map(p => p.id))
  const entries = new Map<string, KnownEntry>([...known].map(([id, k]) => [id, { path: k.path, title: k.title, parentId: k.parentId }]))
  const desired = planPaths(pages, entries)
  let stale = false

  // Links are written as relative paths, so a page whose own path or a link target's path changed has
  // different file text even though nothing was edited. Happens once per move, so it can't loop.
  const movedIds = new Set(pages.filter(p => known.get(p.id) && known.get(p.id)!.path !== desired.get(p.id)).map(p => p.id))

  for (const p of pages) {
    const k = known.get(p.id)
    const path = desired.get(p.id)!
    const dirty = !k || p.updatedAt > k.synced
    const moved = !!k && k.path !== path
    const targets = linkTargets(p.content)
    const linkShift = !dirty && targets.size > 0 && (movedIds.has(p.id) || [...targets].some(t => movedIds.has(t)))
    if (!dirty && !moved && !linkShift) continue

    try {
      // A move can change the mtime (copy-based moves do), so carry the new one forward.
      let mtimeMs = k ? k.mtimeMs : null
      if (moved) {
        const m = await nb.move(k!.path, path)
        if (m) mtimeMs = m.mtimeMs
      }
      if (dirty || linkShift) {
        const text = buildNoteFile(p, { linkHref: fileLinkMapper(path, id => desired.get(id)) })
        const r = await nb.write(path, text, { expect: mtimeMs })
        known.set(p.id, { path, mtimeMs: r.mtimeMs, synced: dirty ? p.updatedAt : k!.synced, title: p.title, parentId: p.parentId })
      } else {
        known.set(p.id, { ...k!, path, mtimeMs: mtimeMs ?? k!.mtimeMs, title: p.title, parentId: p.parentId })
      }
    } catch (e) {
      if (isConflict(e)) stale = true // the disk moved on; pull, then try again
      else throw e
    }
  }

  for (const [id, k] of [...known]) {
    if (byId.has(id)) continue
    await nb.trash(k.path)
    known.delete(id)
  }
  await saveKnown()

  if (stale && attempt < 2) {
    await pull()
    await flush(attempt + 1)
  }
}

// ---- lifecycle ---------------------------------------------------------------------------------

function stopWatching() {
  stopFs?.()
  stopLive?.()
  stopFs = stopLive = undefined
  window.clearTimeout(flushTimer)
}

export async function startFolderSync(): Promise<void> {
  const nb = bridge()
  if (!nb) return
  stopWatching()

  const info = await nb.get()
  const mode = modeOf()
  if (!info.root) {
    root = null
    known = new Map()
    setStatus({ state: 'off', root: null, mode, message: undefined })
    return
  }
  if (info.needsPermission) {
    // Browser only: the folder is remembered but access must be re-granted from a click.
    root = null
    setStatus({ state: 'needs-permission', root: info.root, mode, message: undefined })
    return
  }
  // The folder's identity (not just its display name) decides whether saved bookkeeping applies.
  root = info.id ?? info.root
  setStatus({ root: info.root, mode })
  await loadKnown(root)

  await run(async () => {
    await pull()
    await flush()
  })

  stopFs = nb.onChange(() => void run(pull))
  const sub = liveQuery(() => db.pages.toArray()).subscribe({
    next: () => {
      window.clearTimeout(flushTimer)
      flushTimer = window.setTimeout(() => void run(() => flush()), 400)
    },
    error: () => {},
  })
  stopLive = () => sub.unsubscribe()
}

/** Browser only: re-grant access to the remembered folder. Call from a click. */
export async function reconnectNotebookFolder(): Promise<void> {
  const ok = await bridge()?.reconnect?.()
  if (ok) await startFolderSync()
  else setStatus({ state: 'needs-permission', message: 'Access was not granted' })
}

/** Ask for a folder. Returns the chosen path (not yet in use) or null if cancelled. */
export async function pickNotebookFolder(): Promise<string | null> {
  const r = await bridge()?.choose()
  return r?.root ?? null
}

/** Start using a folder. Pages here are written there; files there are added here (the file wins on id clashes). */
export async function useNotebookFolder(dir: string): Promise<void> {
  const nb = bridge()
  if (!nb) return
  stopWatching()
  await nb.set(dir)
  known = new Map()
  await db.sync.delete(KEY)
  await startFolderSync()
}

/** Stop syncing. Files stay on disk and pages stay in the app. */
export async function stopUsingNotebookFolder(): Promise<void> {
  const nb = bridge()
  if (!nb) return
  stopWatching()
  await nb.clear()
  known = new Map()
  root = null
  await db.sync.delete(KEY)
  setStatus({ state: 'off', root: null, message: undefined })
}
