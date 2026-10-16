/**
 * What the editor needs to know about the rest of the notebook to support links: the list of pages
 * (for the `[[` picker and broken-link marking), how to open one, and how to create one. The app shell
 * keeps it current; the editor only reads it. A module-level singleton on purpose: editor extensions are
 * created outside React and must not import app code.
 */
export interface DirPage {
  id: string
  title: string
}

export interface PageDirectory {
  pages: DirPage[]
  navigate: (id: string) => void
  create: (title: string) => Promise<DirPage>
}

let current: PageDirectory = {
  pages: [],
  navigate: () => {},
  create: async title => ({ id: '', title }),
}

export const getPageDirectory = () => current
export const setPageDirectory = (next: Partial<PageDirectory>) => {
  current = { ...current, ...next }
}

/** Rank page titles for a `[[` query: prefix beats substring beats loose subsequence. */
export function matchPages(pages: DirPage[], query: string, limit = 8): DirPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...pages].sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit)
  const score = (title: string) => {
    const t = title.toLowerCase()
    if (t === q) return 4
    if (t.startsWith(q)) return 3
    if (t.includes(q)) return 2
    let i = 0
    for (const ch of t) if (ch === q[i]) i++
    return i === q.length ? 1 : 0
  }
  return pages
    .map(p => ({ p, s: score(p.title) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.title.localeCompare(b.p.title))
    .slice(0, limit)
    .map(x => x.p)
}
