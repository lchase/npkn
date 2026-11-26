import type { Page } from './types'

/**
 * Can `id` be moved under `parentId` (null = top level)? Not onto itself or any of its descendants,
 * which would detach a cycle from the tree.
 */
export function canMoveUnder(pages: Pick<Page, 'id' | 'parentId'>[], id: string, parentId: string | null): boolean {
  const parentOf = new Map(pages.map(p => [p.id, p.parentId]))
  // ponytail: hop cap guards against an already-corrupt cycle in stored data.
  for (let cur = parentId, hops = 0; cur && hops < 1000; cur = parentOf.get(cur) ?? null, hops++) {
    if (cur === id) return false
  }
  return true
}
