import type { Doc, Page } from './types'

export function plainText(d: Doc | null): string {
  if (!d) return ''
  if (d.text) return d.text
  return (d.content ?? []).map(plainText).join(' ')
}

/** Case-insensitive substring match over title, front matter and body. */
export function searchPages(pages: Page[], query: string): Page[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return pages.filter(
    p =>
      p.title.toLowerCase().includes(q) ||
      (p.frontmatter ?? '').toLowerCase().includes(q) ||
      plainText(p.content).toLowerCase().includes(q),
  )
}
