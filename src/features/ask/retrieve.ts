import type { Doc, Page } from '../../core/types'
import { registryFromPages } from '../../core/labels'
import { extractTodos } from '../../core/todos'
import { toISO } from '../../core/dates'
import { frontTags, frontText, parseFront, privateIds } from '../../core/frontmatter'

export interface Chunk {
  pageId: string
  pageTitle: string
  heading: string
  text: string
}

export interface Source {
  n: number
  pageId: string
  title: string
}

/** Below this many characters of notes, skip retrieval and send everything. */
const FULL_CONTEXT_LIMIT = 12000
const CHUNK_TARGET = 700
const TOP_K = 6

// --- note -> text --------------------------------------------------------------

function inline(n: Doc): string {
  if (n.type === 'text') return n.text ?? ''
  if (n.type === 'hardBreak') return '\n'
  if (n.type === 'chip') {
    return n.attrs?.kind === 'date' ? `@${n.attrs.iso ?? n.attrs.value}` : `@${n.attrs?.value}`
  }
  return (n.content ?? []).map(inline).join('')
}

function lines(node: Doc, out: { heading?: string; text: string }[], heading: { v: string }) {
  switch (node.type) {
    case 'heading': {
      heading.v = inline(node)
      out.push({ heading: heading.v, text: '# ' + heading.v })
      return
    }
    case 'paragraph': {
      const s = inline(node).trim()
      if (s) out.push({ heading: heading.v, text: s })
      return
    }
    case 'codeBlock': {
      out.push({ heading: heading.v, text: '```\n' + inline(node) + '\n```' })
      return
    }
    case 'taskItem':
    case 'listItem': {
      const [first, ...rest] = node.content ?? []
      const prefix = node.type === 'taskItem' ? (node.attrs?.checked ? '[x] ' : '[ ] ') : '- '
      const s = first ? inline(first).trim() : ''
      if (s) out.push({ heading: heading.v, text: prefix + s })
      rest.forEach(c => lines(c, out, heading))
      return
    }
    default:
      node.content?.forEach(c => lines(c, out, heading))
  }
}

/** Front matter as a searchable chunk: type, description, tags and other simple fields. */
function metaChunk(page: Page): Chunk | null {
  const parsed = parseFront(page.frontmatter)
  if (!parsed?.ok) return null
  const d = parsed.data
  const rows: string[] = []
  for (const key of ['type', 'title', 'description']) {
    const v = frontText(d, key)
    if (v) rows.push(`${key}: ${v}`)
  }
  const tags = frontTags(d)
  if (tags.length) rows.push('tags: ' + tags.join(', '))
  for (const [k, v] of Object.entries(d)) {
    if (['type', 'title', 'description', 'tags'].includes(k)) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') rows.push(`${k}: ${v}`)
  }
  if (!rows.length) return null
  return { pageId: page.id, pageTitle: page.title || 'Untitled', heading: 'properties', text: rows.join('\n') }
}

export function chunkPage(page: Page): Chunk[] {
  const meta = metaChunk(page)
  const body = chunkBody(page)
  return meta ? [meta, ...body] : body
}

function chunkBody(page: Page): Chunk[] {
  if (!page.content) return []
  const rows: { heading?: string; text: string }[] = []
  lines(page.content, rows, { v: '' })

  const chunks: Chunk[] = []
  let buf: string[] = []
  let len = 0
  let heading = ''
  const flush = () => {
    if (buf.length) chunks.push({ pageId: page.id, pageTitle: page.title || 'Untitled', heading, text: buf.join('\n') })
    buf = []
    len = 0
  }
  for (const r of rows) {
    if (!buf.length) heading = r.heading ?? ''
    buf.push(r.text)
    len += r.text.length
    if (len >= CHUNK_TARGET) flush()
  }
  flush()
  return chunks
}

// --- BM25 ----------------------------------------------------------------------

const STOP = new Set(
  'a an and are as at be but by for from has have how i if in into is it its me my of on or our so that the their them then there these they this to was we what when where which who why will with you your about can do does did tell show give any'.split(' '),
)

/**
 * Light suffix stripping so "asked"/"ask", "quoted"/"quote", "pricing"/"price" and plurals meet.
 * Not a real stemmer; it only needs to be consistent between notes and questions.
 */
function stem(w: string): string {
  let t = w
  for (const suf of ['ings', 'ing', 'ied', 'ies', 'ed', 'es', 'ly', 's']) {
    if (t.length - suf.length >= 3 && t.endsWith(suf)) {
      t = t.slice(0, -suf.length)
      break
    }
  }
  if (t.length > 3 && t.endsWith('e')) t = t.slice(0, -1)
  return t
}

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? []).filter(t => !STOP.has(t)).map(stem)
}

function rank(chunks: Chunk[], query: string): { c: Chunk; score: number }[] {
  const q = [...new Set(tokens(query))]
  if (!q.length) return []
  const docs = chunks.map(c => tokens(`${c.pageTitle} ${c.heading} ${c.text}`))
  const avg = docs.reduce((a, d) => a + d.length, 0) / (docs.length || 1)
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)

  const k1 = 1.5
  const b = 0.75
  const scored = chunks.map((c, i) => {
    const d = docs[i]
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const t of q) {
      const f = tf.get(t)
      if (!f) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5))
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg))
    }
    return { c, score }
  })
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)
}

// --- context -------------------------------------------------------------------

/** Whole pages to include for the best-matching pages, and how much of each. */
const EXPAND_PAGES = 3
const EXPAND_CHARS = 3200

/**
 * Chunk-level BM25 finds the right page but can miss the chunk with the answer (the question's words
 * may live in a neighbouring section). So the best pages are included whole, in reading order, and
 * the remaining budget goes to the strongest chunks from other pages.
 */
function pickChunks(all: Chunk[], query: string): Chunk[] {
  const ranked = rank(all, query)
  const pageOrder: string[] = []
  for (const { c } of ranked) if (!pageOrder.includes(c.pageId)) pageOrder.push(c.pageId)
  const expand = new Set(pageOrder.slice(0, EXPAND_PAGES))

  const out: Chunk[] = []
  const seen = new Set<Chunk>()
  for (const id of pageOrder.slice(0, EXPAND_PAGES)) {
    let used = 0
    for (const c of all) {
      if (c.pageId !== id || used >= EXPAND_CHARS) continue
      out.push(c)
      seen.add(c)
      used += c.text.length
    }
  }
  for (const { c } of ranked) {
    if (out.length >= EXPAND_PAGES * 6 + TOP_K) break
    if (!seen.has(c) && !expand.has(c.pageId)) {
      out.push(c)
      seen.add(c)
    }
    if (out.filter(x => !expand.has(x.pageId)).length >= TOP_K) break
  }
  return out
}


export interface ContextOptions {
  /**
   * Include pages marked `private: true` (and their sub-pages). Defaults to false so a caller has to opt
   * in; only a model running on this machine should ever get them.
   */
  includePrivate?: boolean
}

export function buildContext(
  allPages: Page[],
  query: string,
  opts: ContextOptions = {},
): { system: string; sources: Source[]; mode: 'full' | 'retrieved'; excludedPrivate: number } {
  // Filter first, so private content can't reach chunks, sources, titles, or the open-todos list.
  const hidden = opts.includePrivate ? new Set<string>() : privateIds(allPages)
  const pages = allPages.filter(p => !hidden.has(p.id))
  const all = pages.flatMap(chunkPage)
  const total = all.reduce((a, c) => a + c.text.length, 0)
  const mode = total <= FULL_CONTEXT_LIMIT ? 'full' : 'retrieved'
  const picked = mode === 'full' ? all : pickChunks(all, query)

  const sources: Source[] = []
  const numberOf = (c: Chunk) => {
    let s = sources.find(x => x.pageId === c.pageId)
    if (!s) {
      s = { n: sources.length + 1, pageId: c.pageId, title: c.pageTitle }
      sources.push(s)
    }
    return s.n
  }
  const blocks = picked.map(c => {
    const n = numberOf(c)
    const where = c.heading ? `${c.pageTitle} > ${c.heading}` : c.pageTitle
    return `[${n}] ${where}\n${c.text}`
  })

  const registry = registryFromPages(allPages)
  const today = toISO(new Date())
  const openTodos = extractTodos(pages, registry).filter(t => !t.closed)
  const line = (t: (typeof openTodos)[number]) => {
    const meta = [t.status ? `[${t.status.label}]` : '', ...t.categories.map(c => '#' + c), t.date ? 'due:' + t.date : '']
      .filter(Boolean)
      .join(' ')
    return `- ${t.text}${meta ? ' ' + meta : ''}`
  }
  // Grouped and date-sorted so a model never has to compare dates itself. Measured: with a flat list,
  // larger models answered "what's overdue?" with "nothing", because they skimmed an unsorted list.
  const byDate = (a: (typeof openTodos)[number], b: (typeof openTodos)[number]) => (a.date ?? '').localeCompare(b.date ?? '')
  const buckets: [string, typeof openTodos][] = [
    ['Overdue (due before today)', openTodos.filter(t => t.date && t.date < today).sort(byDate)],
    ['Due today', openTodos.filter(t => t.date === today)],
    ['Upcoming', openTodos.filter(t => t.date && t.date > today).sort(byDate)],
    ['No due date', openTodos.filter(t => !t.date)],
  ]
  let budget = 60
  const open: string[] = []
  for (const [title, items] of buckets) {
    if (!items.length || budget <= 0) continue
    const taken = items.slice(0, budget)
    budget -= taken.length
    open.push(`### ${title}`, ...taken.map(line))
  }

  const system = [
    "You answer questions about the user's personal notes. Use only the notes below; if they don't contain the answer, say so plainly instead of guessing.",
    'When you use a note, cite it with its number like [1]. Be concise.',
    `Today's date is ${toISO(new Date())}.`,
    '',
    '## Notes',
    blocks.length ? blocks.join('\n\n') : '(no matching notes)',
    '',
    '## Open todos (all pages)',
    open.length ? open.join('\n') : '(none)',
  ].join('\n')

  return { system, sources, mode, excludedPrivate: hidden.size }
}
