import type { Doc, Page } from './types'

export function plainText(d: Doc | null): string {
  if (!d) return ''
  if (d.text) return d.text
  return (d.content ?? []).map(plainText).join(' ')
}

/** A run of snippet text; `hit` runs are the matched words. Rendered as React nodes, never as HTML. */
export interface SnippetPart {
  text: string
  hit: boolean
}

export interface SearchResult {
  page: Page
  /** One line around the first body match; empty when only the title or front matter matched. */
  snippet: SnippetPart[]
}

const RADIUS = 40

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Case-insensitive AND search over title, front matter and body. Ranked: title exact > prefix > contains,
 * then front matter, then body; ties alphabetical.
 */
export function searchPages(pages: Page[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = [...new Set(q.split(/\s+/))]
  // Longest first so "budget" wins over "bud" in the alternation.
  const re = new RegExp([...words].sort((a, b) => b.length - a.length).map(escape).join('|'), 'gi')

  const ranked: { rank: number; result: SearchResult }[] = []
  for (const page of pages) {
    const title = page.title.toLowerCase()
    const front = (page.frontmatter ?? '').toLowerCase()
    const body = plainText(page.content).replace(/\s+/g, ' ').trim()
    const lower = body.toLowerCase()
    if (!words.every(w => title.includes(w) || front.includes(w) || lower.includes(w))) continue
    const rank =
      title === q ? 0
      : title.startsWith(q) ? 1
      : words.every(w => title.includes(w)) ? 2
      : words.every(w => title.includes(w) || front.includes(w)) ? 3
      : 4
    ranked.push({ rank, result: { page, snippet: snippet(body, re) } })
  }
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.result.page.title || 'Untitled').localeCompare(b.result.page.title || 'Untitled', undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
    )
    .map(r => r.result)
}

/** ~RADIUS chars either side of the first match, cut at word boundaries, every match marked. */
export function snippet(body: string, re: RegExp): SnippetPart[] {
  re.lastIndex = 0
  const first = re.exec(body)
  if (!first) return []
  const at = first.index
  const matchEnd = at + first[0].length

  let start = Math.max(0, at - RADIUS)
  if (start > 0) {
    const sp = body.indexOf(' ', start - 1)
    start = sp >= 0 && sp < at ? sp + 1 : at
  }
  let end = Math.min(body.length, matchEnd + RADIUS)
  if (end < body.length) {
    const sp = body.lastIndexOf(' ', end)
    end = sp >= matchEnd ? sp : matchEnd
  }

  const parts: SnippetPart[] = []
  if (start > 0) parts.push({ text: '…', hit: false })
  const window = body.slice(start, end)
  let last = 0
  re.lastIndex = 0
  for (let m = re.exec(window); m; m = re.exec(window)) {
    if (m.index > last) parts.push({ text: window.slice(last, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < window.length) parts.push({ text: window.slice(last), hit: false })
  if (end < body.length) parts.push({ text: '…', hit: false })
  return parts
}
