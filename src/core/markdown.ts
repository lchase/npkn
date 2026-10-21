import { generateJSON } from '@tiptap/core'
import { marked } from 'marked'
import { stringify } from 'yaml'
import type { Doc, Page } from './types'
import { editorExtensions } from '../editor/extensions'
import { parseDate } from './dates'
import { frontText, parseFront } from './frontmatter'
import { hrefToId, mapLinks } from './links'

// ---------------------------------------------------------------------------------------------
// Doc -> Markdown
// ---------------------------------------------------------------------------------------------

function inline(n: Doc): string {
  if (n.type === 'hardBreak') return '  \n'
  if (n.type === 'chip') return '@' + (n.attrs?.kind === 'date' ? (n.attrs.iso ?? n.attrs.value) : n.attrs?.value)
  if (n.type !== 'text') return (n.content ?? []).map(inline).join('')

  let s = n.text ?? ''
  const marks = (n.marks ?? []).map(m => m.type)
  if (marks.includes('code')) {
    // Fence with one more backtick than the longest run inside, padding so edges don't merge.
    const longest = Math.max(0, ...(s.match(/`+/g) ?? []).map(r => r.length))
    const fence = '`'.repeat(longest + 1)
    s = longest ? `${fence} ${s} ${fence}` : fence + s + fence
  }
  if (marks.includes('bold')) s = '**' + s + '**'
  if (marks.includes('italic')) s = '*' + s + '*'
  if (marks.includes('strike')) s = '~~' + s + '~~'
  const link = (n.marks ?? []).find(m => m.type === 'link')
  if (link) s = `[${s}](${link.attrs?.href ?? ''})`
  return s
}

function indent(s: string, pad: string): string {
  return s
    .split('\n')
    .map((l, i) => (i === 0 || !l ? l : pad + l))
    .join('\n')
}

function block(n: Doc, orderedIndex = 0): string {
  switch (n.type) {
    case 'paragraph':
      return inline(n).trimEnd()
    case 'heading':
      return '#'.repeat(n.attrs?.level ?? 2) + ' ' + inline(n).trim()
    case 'blockquote':
      return (n.content ?? []).map(c => block(c)).join('\n\n').split('\n').map(l => '> ' + l).join('\n')
    case 'codeBlock': {
      const lang = n.attrs?.language && n.attrs.language !== 'plaintext' ? n.attrs.language : ''
      return '```' + lang + '\n' + inline(n) + '\n```'
    }
    case 'horizontalRule':
      return '---'
    case 'table':
      return table(n)
    case 'bulletList':
      return (n.content ?? []).map(li => '- ' + indent(item(li), '  ')).join('\n')
    case 'orderedList':
      return (n.content ?? []).map((li, i) => `${i + 1}. ` + indent(item(li), '   ')).join('\n')
    case 'taskList':
      return (n.content ?? [])
        .map(li => (li.attrs?.checked ? '- [x] ' : '- [ ] ') + indent(item(li), '  '))
        .join('\n')
    default:
      return (n.content ?? []).map(c => block(c)).join('\n\n')
  }
}

/**
 * GFM tables are one line per row, so a cell is its paragraphs joined with <br> (which import turns back
 * into a hard break), with pipes escaped. GFM requires a header row: a table whose first row is plain
 * cells is written with that row as the header.
 */
function table(t: Doc): string {
  const rows = (t.content ?? []).map(r =>
    (r.content ?? []).map(c =>
      (c.content ?? []).map(p => inline(p).trim().replace(/\s*\n\s*/g, '<br>')).join('<br>').replace(/\|/g, '\\|'),
    ),
  )
  if (!rows.length) return ''
  const cols = Math.max(...rows.map(r => r.length))
  const line = (r: string[]) => '| ' + Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ') + ' |'
  return [line(rows[0]), line(Array(cols).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

function item(li: Doc): string {
  return (li.content ?? []).map(c => block(c)).join('\n')
}

export interface WriteOptions {
  /**
   * Rewrites each link's href on the way out (internal `npkn:<id>` -> a relative file path). Return null
   * to drop the link and keep its text. Without it, internal links become plain text rather than leaking
   * the app's private scheme into a file.
   */
  linkHref?: (href: string) => string | null
}

const dropInternal = (href: string) => (hrefToId(href) ? null : href)

export function docToMarkdown(doc: Doc | null, opts: WriteOptions = {}): string {
  if (!doc) return ''
  return (mapLinks(doc, opts.linkHref ?? dropInternal).content ?? []).map(c => block(c)).join('\n\n')
}

/** A page as an OKF concept file: YAML front matter, then markdown body. `type` is always present. */
export function pageToMarkdown(page: Page, opts: WriteOptions = {}): string {
  const parsed = parseFront(page.frontmatter)
  let yaml: string
  if (parsed?.ok && typeof parsed.data.type === 'string' && parsed.data.type.trim()) {
    yaml = page.frontmatter!.trim() // verbatim: keeps comments, order and unknown keys
  } else {
    const base = parsed?.ok ? parsed.data : {}
    yaml = stringify({ type: 'note', ...(page.title && !base.title ? { title: page.title } : {}), ...base }).trim()
  }
  return `---\n${yaml}\n---\n\n${docToMarkdown(page.content, opts)}\n`
}

// ---------------------------------------------------------------------------------------------
// Markdown -> Doc
// ---------------------------------------------------------------------------------------------

const FRONT_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Turn `@work` / `@fri` words in text nodes into chips, mirroring the editor's input rule. */
function chipify(n: Doc): Doc {
  if (n.type === 'codeBlock') {
    // marked puts a trailing newline inside fenced code; drop exactly one so round-trips are stable.
    return { ...n, content: (n.content ?? []).map(c => (c.text ? { ...c, text: c.text.replace(/\n$/, '') } : c)) }
  }
  if (!n.content) return n
  const out: Doc[] = []
  for (const c of n.content) {
    if (c.type !== 'text' || !c.text || c.marks?.some(m => m.type === 'code')) {
      out.push(chipify(c))
      continue
    }
    const re = /(^|\s)@([\w-]+)(?=$|[\s.,;:!?)])/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(c.text))) {
      const start = m.index + m[1].length
      if (start > last) out.push({ ...c, text: c.text.slice(last, start) })
      const iso = parseDate(m[2])
      out.push({ type: 'chip', attrs: { kind: iso ? 'date' : 'category', value: m[2], iso } })
      last = start + 1 + m[2].length
    }
    if (last < c.text.length) out.push({ ...c, text: c.text.slice(last) })
  }
  return { ...n, content: out }
}

/** marked renders GFM tasks as <li><input type=checkbox>; reshape to what the TaskItem node parses. */
function tasksToTiptap(html: string): string {
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const isBox = (el: Element | undefined): el is HTMLInputElement => !!el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox'
  dom.querySelectorAll('li').forEach(li => {
    // Direct child, or (for "loose" lists) inside the first <p>. No :scope, so this runs anywhere.
    const kids = Array.from(li.children)
    const box = kids.find(isBox) ?? Array.from(kids.find(c => c.tagName === 'P')?.children ?? []).find(isBox)
    if (!box) return
    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', box.checked || box.hasAttribute('checked') ? 'true' : 'false')
    box.remove()
    li.parentElement?.setAttribute('data-type', 'taskList')
  })
  return dom.body.innerHTML
}

/**
 * Plain-text clipboard content that is really a table, as GFM markdown, else null. Handles a pasted
 * markdown table and tab-separated rows (what Excel/Sheets put on the clipboard as text). Only when the
 * WHOLE paste is table lines, so prose that happens to contain a pipe or a tab is left alone.
 */
export function pastedTableMarkdown(text: string): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return null
  const sep = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
  if (lines.every(l => l.includes('|')) && sep.test(lines[1])) return lines.join('\n')
  const rows = lines.map(l => l.split('\t'))
  const w = rows[0].length
  if (w < 2 || rows.some(r => r.length !== w)) return null
  const row = (r: string[]) => '| ' + r.map(c => c.trim().replace(/\|/g, '\\|')).join(' | ') + ' |'
  return [row(rows[0]), row(Array(w).fill('---')), ...rows.slice(1).map(row)].join('\n')
}

export interface ImportedPage {
  title: string
  frontmatter?: string
  content: Doc
}

export function markdownToPage(text: string, filename: string): ImportedPage {
  let body = text.replace(/^﻿/, '')
  let frontmatter: string | undefined
  const m = FRONT_RE.exec(body)
  if (m) {
    frontmatter = m[1]
    body = body.slice(m[0].length)
  }

  const parsed = parseFront(frontmatter)
  let title = parsed?.ok ? frontText(parsed.data, 'title') : ''
  if (!title) {
    const h1 = /^#\s+(.+)$/m.exec(body)
    title = h1?.[1].trim() ?? filename.replace(/\.(md|markdown)$/i, '')
  }
  // A leading "# Title" that repeats the page title is redundant; the title field already shows it.
  body = body.replace(new RegExp(`^\\s*#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '')

  const html = tasksToTiptap(marked.parse(body, { gfm: true, async: false }) as string)
  const doc = chipify(generateJSON(html, editorExtensions) as Doc)
  return { title, frontmatter, content: doc }
}
