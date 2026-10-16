import Dexie, { type Table } from 'dexie'
import type { Page } from '../core/types'

/**
 * IndexedDB via Dexie. Nothing outside src/data should import this: go through ./pages so the
 * storage backend can be swapped (e.g. for a synced server) without touching UI code.
 */
/** Bookkeeping for syncing with a notebook folder. Lives in the same database as the pages on purpose:
 *  if one is wiped the other goes with it, so the two can never disagree about what's been synced. */
export interface SyncRow {
  key: string
  root: string
  known: Record<string, { path: string; mtimeMs: number; synced: number; title: string; parentId: string | null }>
}

/** The folder the browser was granted access to. Handles are structured-cloneable, so IndexedDB can hold them. */
export interface HandleRow {
  key: string
  id: string
  name: string
  handle: FileSystemDirectoryHandle
}

class NotesDB extends Dexie {
  pages!: Table<Page, string>
  sync!: Table<SyncRow, string>
  handles!: Table<HandleRow, string>
  constructor() {
    super('notes')
    this.version(1).stores({ pages: 'id, parentId, updatedAt' })
    this.version(2).stores({ pages: 'id, parentId, updatedAt', sync: 'key' })
    this.version(3).stores({ pages: 'id, parentId, updatedAt', sync: 'key', handles: 'key' })
  }
}

export const db = new NotesDB()
