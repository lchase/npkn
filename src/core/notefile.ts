import { stringify } from 'yaml'
import type { Page } from './types'
import { parseFront } from './frontmatter'
import { docToMarkdown, markdownToPage, type WriteOptions } from './markdown'

/**
 * Pages as plain files, for a notebook folder. The file is the source of truth:
 *
 *   ---
 *   id: "…"          stable identity, survives rename/move (hidden from the properties UI)
 *   type: note       OKF requires a type
 *   title: "…"
 *   …any other keys the user wrote, in their order, with their comments
 *   ---
 *   markdown body
 *
 * Pure functions only; no storage and no DOM beyond what markdown import already needs.
 */

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled'

// ---- YAML key surgery (top-level keys only; preserves comments, order, everything else) ----------

const lineFor = (key: string) => new RegExp(`^${key}:.*(?:\\n|$)`, 'm')

/** Set a top-level `key: value`. Replaces the line if present, otherwise inserts at the top. */
export function upsertYamlKey(yaml: string, key: string, value: string): string {
  const line = `${key}: ${value}`
  const re = lineFor(key)
  if (re.test(yaml)) return yaml.replace(re, line + '\n').replace(/\n+$/, '\n').replace(/^\n+/, '')
  return yaml.trim() ? `${line}\n${yaml}` : line + '\n'
}

/** Add `key: value` at the end if the key isn't there yet. Used for quick-add so existing order is kept. */
export function addYamlKey(yaml: string, key: string, value: string): string {
  if (lineFor(key).test(yaml)) return yaml
  const body = yaml.replace(/\s+$/, '')
  return (body ? body + '\n' : '') + `${key}: ${value}`.trimEnd() + '\n'
}

/** Rename a top-level key, keeping its value, comments and position. */
export function renameYamlKey(yaml: string, from: string, to: string): string {
  return yaml.replace(new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm'), `${to}:`)
}

/**
 * Replace (or append) a top-level key whose value is a nested structure. The old block is the key line
 * plus every following indented or blank line, so neighbouring keys and comments are untouched.
 */
export function setYamlBlock(yaml: string, key: string, value: unknown): string {
  const lines = yaml.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(l => new RegExp(`^${key}:`).test(l))
  const block = stringify({ [key]: value }).trimEnd().split('\n')
  if (start < 0) {
    const body = lines.join('\n').replace(/\s+$/, '')
    return (body ? body + '\n' : '') + block.join('\n') + '\n'
  }
  let end = start + 1
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++
  // Don't swallow trailing blank lines that belong to whatever follows.
  while (end > start + 1 && lines[end - 1] === '') end--
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join('\n').replace(/\n*$/, '\n')
}

export function stripYamlKey(yaml: string, key: string): string {
  return yaml.replace(lineFor(key), '')
}

// ---- file <-> page --------------------------------------------------------------------------------

/** The text we write for a page. Always carries id, type and title. */
export function buildNoteFile(page: Page, opts: WriteOptions = {}): string {
  let y = (page.frontmatter ?? '').replace(/\r\n/g, '\n').trim()

  const parsed = parseFront(y)
  const hasType = parsed?.ok && typeof parsed.data.type === 'string' && parsed.data.type.trim() !== ''
  if (!hasType) y = upsertYamlKey(y, 'type', 'note')
  y = upsertYamlKey(y, 'title', JSON.stringify(page.title || 'Untitled'))
  y = upsertYamlKey(y, 'id', JSON.stringify(page.id)) // last, so it ends up first

  return `---\n${y.trim()}\n---\n\n${docToMarkdown(page.content, opts)}\n`
}

export interface ParsedNote {
  /** Identity from front matter, or null for a file we haven't seen before. */
  id: string | null
  title: string
  /** User-visible front matter: everything except `id`. */
  frontmatter?: string
  content: Page['content']
}

export function parseNoteFile(text: string, filename: string): ParsedNote {
  const imp = markdownToPage(text, filename)
  const parsed = parseFront(imp.frontmatter)
  const raw = parsed?.ok ? parsed.data.id : undefined
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : null
  const fm = imp.frontmatter ? stripYamlKey(imp.frontmatter, 'id').trim() : ''
  return { id, title: imp.title, frontmatter: fm || undefined, content: imp.content }
}

/**
 * Give a file we've never seen an id without touching anything else in it. A file the user wrote by
 * hand keeps its exact formatting; only an `id:` line is added.
 */
export function withId(text: string, id: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  const idLine = `id: ${JSON.stringify(id)}`
  if (m) return text.slice(0, m.index) + `---\n${idLine}\n${m[1]}\n---\n` + text.slice(m.index + m[0].length)
  return `---\n${idLine}\n---\n\n${text}`
}

// ---- paths ----------------------------------------------------------------------------------------

export interface KnownEntry {
  path: string
  title: string
  parentId: string | null
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const lower = (p: string) => p.toLowerCase() // macOS volumes are case-insensitive

/**
 * Decide each page's file path. Layout: `parent.md` with its children in `parent/child.md`.
 *
 * Stability matters more than tidiness: a page keeps the path it already has unless its title
 * changed or its parent moved, so a folder arrangement the user made by hand isn't undone.
 */
export function planPaths(pages: Page[], known: Map<string, KnownEntry>): Map<string, string> {
  const byId = new Map(pages.map(p => [p.id, p]))
  const result = new Map<string, string>()
  const used = new Set<string>()

  // Parents before children (guarding against cycles), otherwise a stable order.
  const ordered: Page[] = []
  const seen = new Set<string>()
  const visit = (p: Page, depth = 0) => {
    if (seen.has(p.id) || depth > 64) return
    const parent = p.parentId ? byId.get(p.parentId) : undefined
    if (parent) visit(parent, depth + 1)
    if (!seen.has(p.id)) {
      seen.add(p.id)
      ordered.push(p)
    }
  }
  const stable = [...pages].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))
  stable.forEach(p => visit(p))

  // Reserve the paths that will stay put, so a new page can't take one from under them.
  const keeps = new Set<string>()
  const wantsKeep = (p: Page): boolean => {
    const k = known.get(p.id)
    return !!k && k.title === p.title && k.parentId === p.parentId
  }
  for (const p of ordered) if (wantsKeep(p)) used.add(lower(known.get(p.id)!.path))

  for (const p of ordered) {
    const parent = p.parentId ? byId.get(p.parentId) : undefined
    const parentPath = parent ? result.get(parent.id) : undefined
    const dir = parentPath ? parentPath.replace(/\.md$/i, '') + '/' : ''
    const k = known.get(p.id)

    const stays = wantsKeep(p) && (!parentPath || dirOf(k!.path) + '/' === dir)
    if (stays) {
      result.set(p.id, k!.path)
      keeps.add(p.id)
      continue
    }
    if (k && wantsKeep(p)) used.delete(lower(k.path)) // reserved above but it's moving after all

    const base = slug(p.title)
    let candidate = `${dir}${base}.md`
    for (let i = 2; used.has(lower(candidate)); i++) candidate = `${dir}${base}-${i}.md`
    used.add(lower(candidate))
    result.set(p.id, candidate)
  }
  return result
}

/** Name for the copy we keep when both the app and the disk changed the same page. */
export function conflictPath(path: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return path.replace(/\.md$/i, '') + `.conflict-${stamp}.md`
}
