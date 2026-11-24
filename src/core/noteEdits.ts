import type { Doc } from './types'

/**
 * Changes to notes that the chat can PROPOSE. The model puts each one in a fenced block (language
 * `npkn-edit`) holding one JSON object; the UI turns them into cards the user approves. Nothing here
 * touches storage. Edits work on the document tree, not on markdown, so links and chips survive.
 *
 *   {"op":"create","title":"…","body":"markdown"}
 *   {"op":"append","page":2,"body":"markdown"}            page = the [n] the note was given in the prompt
 *   {"op":"replace","page":2,"find":"exact","with":"new"}  plain text, inside one run of formatting
 */
export type Edit =
  | { op: 'create'; title: string; body: string }
  | { op: 'append'; page: number; body: string }
  | { op: 'replace'; page: number; find: string; with: string }
  /** A block that was there but could not be understood; shown so a bad reply is not silently dropped. */
  | { op: 'invalid'; raw: string }

// Any fenced block. Small local models often drop or change the language label, so a block counts when it is
// labelled npkn-edit OR its JSON carries a known `op`; every other code fence is left exactly as written.
const FENCE = /```([\w-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?```/g
const OPS = new Set(['create', 'append', 'replace'])
// A block still being streamed: hide it rather than flash half a JSON object.
const OPEN_FENCE = /```(?:npkn-edit|[\w-]*\s*\{\s*"op")[\s\S]*$/

const MAX_BODY = 20000
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null)

function toEdit(json: string): Edit {
  const raw = json.trim().slice(0, 400)
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    const page = typeof o.page === 'number' && Number.isInteger(o.page) && o.page > 0 ? o.page : null
    if (o.op === 'create') {
      const title = str(o.title, 200)?.trim()
      const body = str(o.body, MAX_BODY)
      if (title && body !== null) return { op: 'create', title, body }
    } else if (o.op === 'append') {
      const body = str(o.body, MAX_BODY)
      if (page && body?.trim()) return { op: 'append', page, body }
    } else if (o.op === 'replace') {
      const find = str(o.find, MAX_BODY)
      const rep = str(o.with, MAX_BODY)
      if (page && find && rep !== null) return { op: 'replace', page, find, with: rep }
    }
  } catch {
    /* fall through */
  }
  return { op: 'invalid', raw }
}

function looksLikeEdit(json: string): boolean {
  try {
    const o = JSON.parse(json) as { op?: unknown }
    return typeof o?.op === 'string' && OPS.has(o.op)
  } catch {
    return false
  }
}

/** Split a reply into what to show as text and the edits it proposes (complete fences only). */
export function parseEdits(text: string): { text: string; edits: Edit[] } {
  const edits: Edit[] = []
  const shown = text
    .replace(FENCE, (whole: string, lang: string, json: string) => {
      if (lang !== 'npkn-edit' && !looksLikeEdit(json)) return whole
      edits.push(toEdit(json))
      return ''
    })
    .replace(OPEN_FENCE, '')
  return { text: shown.replace(/\n{3,}/g, '\n\n').trim(), edits }
}

export type DocResult = { ok: true; doc: Doc } | { ok: false; reason: string }

const countIn = (s: string, find: string) => (find ? s.split(find).length - 1 : 0)

/**
 * Replace `find` with `rep` when it occurs exactly once, inside a single text node. Refusing anything
 * else (zero matches, several, or text split by formatting) is deliberate: a wrong guess edits the wrong
 * place in someone's notes.
 */
export function replaceInDoc(doc: Doc | null, find: string, rep: string): DocResult {
  if (!doc) return { ok: false, reason: 'That note is empty.' }
  let total = 0
  const count = (n: Doc) => {
    if (typeof n.text === 'string') total += countIn(n.text, find)
    n.content?.forEach(count)
  }
  count(doc)
  if (total === 0) return { ok: false, reason: "That exact text isn't in the note (it may span bold/links or have changed)." }
  if (total > 1) return { ok: false, reason: `That text appears ${total} times, so it isn't clear which to change.` }

  const walk = (n: Doc): Doc | null => {
    if (typeof n.text === 'string') {
      if (!n.text.includes(find)) return n
      const text = n.text.replace(find, () => rep)
      return text ? { ...n, text } : null // an empty text node is invalid in the schema
    }
    if (!n.content) return n
    return { ...n, content: n.content.map(walk).filter((c): c is Doc => c !== null) }
  }
  return { ok: true, doc: walk(doc)! }
}

/** Add blocks to the end of a document (an empty/missing note becomes just the new blocks). */
export function appendToDoc(doc: Doc | null, blocks: Doc[]): Doc {
  return { ...(doc ?? { type: 'doc' }), type: 'doc', content: [...(doc?.content ?? []), ...blocks] }
}
