import { parse } from 'yaml'
import type { Page } from './types'

/**
 * Open Knowledge Format front matter. Only `type` is required by the format; everything else,
 * including unknown keys, is allowed and preserved. We store the raw YAML text and parse on demand.
 */
export type FrontMatter = Record<string, unknown>

export type ParsedFront = { ok: true; data: FrontMatter } | { ok: false; error: string }

export function parseFront(text: string | undefined): ParsedFront | null {
  if (!text || !text.trim()) return null
  try {
    const data = parse(text)
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'Front matter must be a YAML mapping (key: value)' }
    }
    return { ok: true, data: data as FrontMatter }
  } catch (e) {
    return { ok: false, error: (e as Error).message.split('\n')[0] }
  }
}

export function frontType(p: ParsedFront | null): string | null {
  if (!p || !p.ok) return null
  const t = p.data.type
  return typeof t === 'string' && t.trim() ? t.trim() : null
}

export function frontTags(data: FrontMatter): string[] {
  const t = data.tags
  if (Array.isArray(t)) return t.map(x => String(x))
  if (typeof t === 'string') return t.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

export function frontText(data: FrontMatter, key: string): string {
  const v = data[key]
  return typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v)
}

export const NEW_FRONT = (title: string) =>
  `type: note  # note, meeting, decision, project, person, runbook…\n` +
  `title: ${JSON.stringify(title || 'Untitled')}\n` +
  `description:  # one line; helps search and Ask find this page\n` +
  `tags: []\n` +
  `# private: true  # uncomment to keep this page out of cloud models\n`

/** `private: true` (or the string "true") in front matter. Anything else, including invalid YAML, is not private. */
export function isFlaggedPrivate(frontmatter: string | undefined): boolean {
  const p = parseFront(frontmatter)
  if (!p || !p.ok) return false
  const v = p.data.private
  return v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true')
}

/**
 * Ids of pages that must not be shared with a cloud model: flagged pages and everything beneath them.
 * Inheritance is deliberate: marking "Interviews" private should protect every candidate page under it.
 */
export function privateIds(pages: Pick<Page, 'id' | 'parentId' | 'frontmatter'>[]): Set<string> {
  const byId = new Map(pages.map(p => [p.id, p]))
  const flagged = new Set(pages.filter(p => isFlaggedPrivate(p.frontmatter)).map(p => p.id))
  const out = new Set<string>()
  for (const p of pages) {
    let cur: typeof p | undefined = p
    for (let hops = 0; cur && hops < 64; hops++) {
      if (flagged.has(cur.id)) {
        out.add(p.id)
        break
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }
  return out
}
