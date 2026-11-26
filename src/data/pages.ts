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

/**
 * The daily note for `date` (ISO), under a top-level `Journal` page; both are created if missing.
 * Found by parent + exact title, so a renamed day page gets a fresh one rather than a lookalike.
 * One rw transaction, so a double click can't create two (Dexie serialises them).
 */
export const dailyPage = (date: string): Promise<string> =>
  db.transaction('rw', db.pages, async () => {
    const all = await db.pages.toArray()
    let journal = all.find(p => p.parentId === null && p.title === 'Journal')
    if (!journal) await db.pages.add((journal = newPage(null, 'Journal')))
    const journalId = journal.id
    let day = all.find(p => p.parentId === journalId && p.title === date)
    if (!day) await db.pages.add((day = { ...newPage(journalId, date), frontmatter: 'type: journal\n' }))
    return day.id
  })

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
