import type { Doc, Page } from './types'

/**
 * Links between pages.
 *
 * In the app an internal link is a normal link mark whose href is `npkn:<page id>`. The id survives
 * renames and moves. In files it is an ordinary relative markdown link (`[Plan](projects/plan.md)`),
 * which is what Open Knowledge Format and every other tool expect. These helpers translate between the
 * two, and never leak the `npkn:` scheme into a file.
 */

const SCHEME = 'npkn:'

export const pageHref = (id: string) => SCHEME + id

/** The page id an href points at, or null if it isn't an internal link. */
export function hrefToId(href: string | null | undefined): string | null {
  return href && href.startsWith(SCHEME) ? href.slice(SCHEME.length) || null : null
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** Normalise `a/./b/../c.md` -> `a/c.md`. Returns null if it climbs out of the root. */
function normalise(path: string): string | null {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(part)
  }
  return out.join('/')
}

/** Relative path from the file at `from` to the file at `to`, both notebook-relative like `a/b.md`. */
export function relativePath(from: string, to: string): string {
  const a = dirOf(from).split('/').filter(Boolean)
  const b = to.split('/')
  const file = b.pop()!
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...Array(a.length - i).fill('..'), ...b.slice(i), file].join('/')
}

/**
 * If `href` is a relative link to a markdown file, the notebook path it refers to when written in the
 * file at `fromPath`. Null for web links, anchors, mail links, absolute paths and non-markdown files.
 */
export function resolveRelative(fromPath: string, href: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  let clean = href.split('#')[0].split('?')[0]
  try {
    clean = decodeURI(clean)
  } catch {
    /* leave as written */
  }
  if (!/\.(md|markdown)$/i.test(clean)) return null
  return normalise(dirOf(fromPath) ? `${dirOf(fromPath)}/${clean}` : clean)
}

/** A copy of the doc with every link mark's href passed through `fn`. `fn` returning null removes the link. */
export function mapLinks(doc: Doc, fn: (href: string) => string | null): Doc {
  const walk = (n: Doc): Doc => {
    let next = n
    if (n.marks?.some(m => m.type === 'link')) {
      const marks: NonNullable<Doc['marks']> = []
      for (const m of n.marks) {
        if (m.type !== 'link') {
          marks.push(m)
          continue
        }
        const to = fn(String(m.attrs?.href ?? ''))
        if (to !== null) marks.push({ ...m, attrs: { ...m.attrs, href: to } })
      }
      next = { ...next, marks: marks.length ? marks : undefined }
      if (!marks.length) delete next.marks
    }
    if (n.content) next = { ...next, content: n.content.map(walk) }
    return next
  }
  return walk(doc)
}

/** Every page id this document links to. */
export function linkTargets(doc: Doc | null | undefined): Set<string> {
  const out = new Set<string>()
  const walk = (n: Doc) => {
    for (const m of n.marks ?? []) {
      const id = m.type === 'link' ? hrefToId(String(m.attrs?.href ?? '')) : null
      if (id) out.add(id)
    }
    n.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return out
}

/** Pages that link to `id`, excluding the page itself. */
export function backlinks(pages: Pick<Page, 'id' | 'title' | 'content'>[], id: string) {
  return pages.filter(p => p.id !== id && linkTargets(p.content).has(id))
}

/**
 * Turn relative `.md` links into internal ones where the target is a known page. Anything that doesn't
 * resolve is left exactly as written, so nothing is lost and a later pass can still resolve it.
 */
export function resolveRelativeLinks(
  doc: Doc,
  fromPath: string,
  pathToId: Map<string, string>,
): { doc: Doc; changed: boolean } {
  let changed = false
  const lower = new Map([...pathToId].map(([p, id]) => [p.toLowerCase(), id])) // macOS is case-insensitive
  const out = mapLinks(doc, href => {
    const target = resolveRelative(fromPath, href)
    if (!target) return href
    const id = pathToId.get(target) ?? lower.get(target.toLowerCase())
    if (!id) return href
    changed = true
    return pageHref(id)
  })
  return { doc: out, changed }
}

/** Does this document contain a relative `.md` link that is not yet resolved to a page? */
export function hasRelativeLinks(doc: Doc | null | undefined, fromPath: string): boolean {
  let found = false
  if (doc) mapLinks(doc, href => ((found ||= resolveRelative(fromPath, href) !== null), href))
  return found
}

/**
 * The href mapper used when writing a page to a file at `selfPath`: internal ids become relative
 * paths; a link to a page that no longer exists is dropped to plain text; web links pass through.
 */
export function fileLinkMapper(selfPath: string, pathOf: (id: string) => string | undefined) {
  return (href: string): string | null => {
    const id = hrefToId(href)
    if (id === null) return href.startsWith(SCHEME) ? null : href
    const target = pathOf(id)
    return target ? encodeURI(relativePath(selfPath, target)) : null
  }
}
