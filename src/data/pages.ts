import { useLiveQuery } from 'dexie-react-hooks'
import type { Page } from '../core/types'
import { db } from './db'

/**
 * The page store. This is the only API the rest of the app uses to read or write notes.
 * To add a backend later, reimplement these functions (HTTP/sync) and leave the callers alone.
 */

export function newPage(parentId: string | null = null, title = ''): Page {
  const now = Date.now()
  return { id: crypto.randomUUID(), parentId, title, content: null, createdAt: now, updatedAt: now }
}

/** Live list of all pages; undefined until the first read resolves. */
export function usePages(): Page[] | undefined {
  return useLiveQuery(() => db.pages.toArray(), [])
}

export const listPages = () => db.pages.toArray()
export const getPage = (id: string) => db.pages.get(id)
export const addPage = (page: Page) => db.pages.add(page)
export const putPage = (page: Page) => db.pages.put(page)

/** Patch a page and bump its updatedAt. */
export const updatePage = (id: string, patch: Partial<Omit<Page, 'id'>>) =>
  db.pages.update(id, { ...patch, updatedAt: Date.now() })

/** Delete a page and every descendant. */
export async function deletePageTree(id: string) {
  const all = await db.pages.toArray()
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const p of all) {
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
        ids.add(p.id)
        grew = true
      }
    }
  }
  await db.pages.bulkDelete([...ids])
}

/**
 * Pages made before `createdAt` existed sorted by updatedAt, so they reshuffled whenever opened.
 * Freeze their current position by copying updatedAt once.
 */
export async function backfillCreatedAt() {
  const missing = (await db.pages.toArray()).filter(p => p.createdAt == null)
  await Promise.all(missing.map(p => db.pages.update(p.id, { createdAt: p.updatedAt })))
}
