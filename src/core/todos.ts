import { effectiveRegistry, isStatus, norm, statusOf, type Group, type Registry } from './labels'
import type { Doc, Page } from './types'

export interface Todo {
  pageId: string
  pageTitle: string
  index: number // traversal order of taskItems within the page
  text: string
  checked: boolean
  /** Finished: the box is ticked, or it carries a status in the "done" group. */
  closed: boolean
  /** Ordinary labels. Status labels are reported separately, in `status`. */
  categories: string[]
  status: { label: string; group: Group } | null
  date: string | null
}

/** Walk every taskItem in document order. Index must match between extract and toggle. */
function walkTasks(node: Doc, visit: (item: Doc, index: number) => void) {
  let i = 0
  const go = (n: Doc) => {
    if (n.type === 'taskItem') visit(n, i++)
    n.content?.forEach(go)
  }
  go(node)
}

function readItem(item: Doc) {
  const para = item.content?.find(c => c.type === 'paragraph')
  let text = ''
  const categories: string[] = []
  let date: string | null = null
  for (const n of para?.content ?? []) {
    if (n.type === 'chip') {
      if (n.attrs?.kind === 'date') date = n.attrs.iso ?? date
      else categories.push(n.attrs?.value)
    } else if (n.type === 'text') {
      text += n.text
    }
  }
  return { text: text.trim(), categories, date }
}

export function extractTodos(pages: Page[], registry: Registry = effectiveRegistry()): Todo[] {
  const out: Todo[] = []
  for (const p of pages) {
    if (!p.content) continue
    walkTasks(p.content, (item, index) => {
      const { text, categories: labels, date } = readItem(item)
      if (!text && !labels.length && !date) return
      const status = statusOf(registry, labels)
      const checked = !!item.attrs?.checked
      out.push({
        pageId: p.id,
        pageTitle: p.title || 'Untitled',
        index,
        text,
        checked,
        closed: checked || status?.group === 'done',
        categories: labels.filter(l => !isStatus(registry, l)),
        status,
        date,
      })
    })
  }
  return out
}

export function toggleTodo(page: Page, index: number): Doc {
  const next: Doc = structuredClone(page.content!)
  walkTasks(next, (item, i) => {
    if (i === index) item.attrs = { ...item.attrs, checked: !item.attrs?.checked }
  })
  return next
}

/**
 * Mark a todo finished or reopen it. Reopening also removes any "done"-group status label, otherwise a
 * todo tagged @done would stay closed no matter how many times its box was unticked.
 */
export function setTodoClosed(page: Page, index: number, closed: boolean, registry: Registry = effectiveRegistry()): Doc {
  const next: Doc = structuredClone(page.content!)
  walkTasks(next, (item, i) => {
    if (i !== index) return
    item.attrs = { ...item.attrs, checked: closed }
    if (closed) return
    const para = item.content?.find(c => c.type === 'paragraph')
    if (!para?.content) return
    para.content = para.content.filter(n => {
      if (n.type !== 'chip' || n.attrs?.kind === 'date') return true
      const d = registry[norm(String(n.attrs?.value ?? ''))]
      return !(d?.kind === 'status' && d.group === 'done')
    })
  })
  return next
}
