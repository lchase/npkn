import { useEffect, useState } from 'react'
import { matchPages } from '../editor/pageDirectory'
import type { Page } from '../core/types'

type Item = { kind: 'page'; id: string; title: string } | { kind: 'create'; title: string }

/**
 * Cmd/Ctrl+P: jump to a page by title. Enter opens the highlighted page; Cmd/Ctrl+Enter (or the
 * "Create" row) makes a new top-level page with the typed title. Same ranking as the `[[` picker.
 */
export function QuickSwitcher({ pages, onOpen, onCreate }: {
  pages: Page[]
  onOpen: (id: string) => void
  onCreate: (title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault() // otherwise the browser's print dialog
        setOpen(o => !o)
        setQuery('')
        setIndex(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  const q = query.trim()
  const items: Item[] = matchPages(pages.map(p => ({ id: p.id, title: p.title || 'Untitled' })), q, 12).map(p => ({ kind: 'page', ...p }))
  if (q && !pages.some(p => p.title.toLowerCase() === q.toLowerCase())) items.push({ kind: 'create', title: q })
  const at = Math.min(index, Math.max(0, items.length - 1))

  const close = () => setOpen(false)
  const pick = (it: Item | undefined) => {
    if (!it) return
    close()
    if (it.kind === 'page') onOpen(it.id)
    else onCreate(it.title)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) setIndex((at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if ((e.metaKey || e.ctrlKey) && q) pick({ kind: 'create', title: q })
      else pick(items[at])
    }
  }

  return (
    <div className="qs-backdrop" onMouseDown={close}>
      <div className="qs" role="dialog" aria-label="Go to page" onMouseDown={e => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Go to page…"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onKeyDown}
          aria-label="Page title"
        />
        <div className="qs-list" role="listbox">
          {items.length === 0 && <div className="pl-empty">No pages yet</div>}
          {items.map((it, i) => (
            <div
              key={it.kind === 'page' ? it.id : 'create'}
              role="option"
              aria-selected={i === at}
              className={'pl-item' + (i === at ? ' on' : '') + (it.kind === 'create' ? ' create' : '')}
              onMouseEnter={() => setIndex(i)}
              onClick={() => pick(it)}
            >
              {it.kind === 'create' ? `Create “${it.title}”` : it.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
