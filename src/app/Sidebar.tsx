import { useEffect, useMemo, useRef, useState } from 'react'
import type { Page } from '../core/types'
import { Avatar, type Mood } from '../features/ask/characters'
import { useAsk } from '../features/ask/store'
import { ThemePicker } from '../themes/ThemePicker'
import { NotebookFolder } from './NotebookFolder'
import { ExportIcon, ImportIcon, LockIcon, PageIcon, PlusIcon, SampleIcon, SearchIcon, SettingsIcon, TodosIcon } from '../ui/icons'

export type View = { kind: 'todos' } | { kind: 'ask' } | { kind: 'settings' } | { kind: 'page'; id: string }

interface Props {
  pages: Page[]
  view: View
  query: string
  results: Page[] | null
  openTodoCount: number
  privateIds: Set<string>
  onQuery: (q: string) => void
  onView: (v: View) => void
  onAdd: (parentId: string | null) => void
  onImport: (files: FileList | null) => void
  onExportBundle: () => void
  onLoadSample: () => void
}

const ASK_STATUS: Record<Mood, string> = {
  idle: 'Ready',
  thinking: 'Thinking…',
  talking: 'Answering…',
  happy: 'Done!',
  error: 'Offline',
}

const KEY = 'npkn.collapsed'

function loadCollapsed(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

/** Alphabetical, case-insensitive, numbers sorted naturally ("Note 2" before "Note 10"). */
const byTitle = (a: Page, b: Page) =>
  (a.title || 'Untitled').localeCompare(b.title || 'Untitled', undefined, { sensitivity: 'base', numeric: true }) ||
  a.id.localeCompare(b.id)

export function Sidebar({ pages, view, query, results, openTodoCount, privateIds, onQuery, onView, onAdd, onImport, onExportBundle, onLoadSample }: Props) {
  const { displayMood } = useAsk()
  const importInput = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const persist = (next: Set<string>) => {
    setCollapsed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }

  const byParent = useMemo(() => {
    const ids = new Set(pages.map(p => p.id))
    const m = new Map<string | null, Page[]>()
    for (const p of pages) {
      // A page whose parent is gone belongs at the top level rather than vanishing from the tree.
      const key = p.parentId && ids.has(p.parentId) ? p.parentId : null
      m.set(key, [...(m.get(key) ?? []), p])
    }
    for (const list of m.values()) list.sort(byTitle)
    return m
  }, [pages])

  const parentOf = useMemo(() => new Map(pages.map(p => [p.id, p.parentId])), [pages])
  const parents = useMemo(() => pages.filter(p => byParent.has(p.id)).map(p => p.id), [pages, byParent])

  // Navigating to a page (search result, link, new sub-page) must never leave it hidden in a
  // collapsed branch, so open every ancestor of the active page.
  const activeId = view.kind === 'page' ? view.id : null
  useEffect(() => {
    if (!activeId) return
    const hidden: string[] = []
    for (let id = parentOf.get(activeId) ?? null; id; id = parentOf.get(id) ?? null) {
      if (collapsed.has(id)) hidden.push(id)
    }
    if (hidden.length) {
      const next = new Set(collapsed)
      hidden.forEach(id => next.delete(id))
      persist(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, parentOf])

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (!next.delete(id)) next.add(id)
    persist(next)
  }

  const allCollapsed = parents.length > 0 && parents.every(id => collapsed.has(id))
  const toggleAll = () => persist(allCollapsed ? new Set() : new Set(parents))

  const go = (v: View) => {
    onQuery('')
    onView(v)
  }

  const count = (id: string): number => (byParent.get(id) ?? []).reduce((n, c) => n + 1 + count(c.id), 0)

  const tree = (parentId: string | null, depth = 0): React.ReactNode => {
    const siblings = byParent.get(parentId) ?? []
    // Reserve the chevron column on every row once any page has children (not per sibling group),
    // otherwise a leaf-only child level loses the column and renders left of its parent. A fully flat
    // list stays unindented.
    const anyKids = parents.length > 0
    return siblings.map(p => {
      const hasKids = byParent.has(p.id)
      const isCollapsed = hasKids && collapsed.has(p.id)
      return (
        <div key={p.id}>
          <div
            className={'nav-item' + (view.kind === 'page' && view.id === p.id ? ' active' : '')}
            style={{ paddingLeft: 4 + depth * 12 }}
            onClick={() => go({ kind: 'page', id: p.id })}
          >
            {hasKids ? (
              <button
                className="nav-chevron"
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                aria-expanded={!isCollapsed}
                onClick={e => (e.stopPropagation(), toggle(p.id))}
              >
                <svg className={'chevron-icon' + (isCollapsed ? ' collapsed' : '')} viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                  <path d="M4 6.2 8 10.2 12 6.2" />
                </svg>
              </button>
            ) : (
              anyKids && <span className="nav-chevron nav-chevron-empty" />
            )}
            <span className="nav-glyph"><PageIcon /></span>
            <span className="nav-title">{p.title || 'Untitled'}</span>
            {privateIds.has(p.id) && <span className="nav-lock" title="Private: not sent to cloud models"><LockIcon size={11} /></span>}
            {isCollapsed && <span className="nav-count">{count(p.id)}</span>}
            <button className="mini" title="Add sub-page" onClick={e => (e.stopPropagation(), onAdd(p.id))}>
              +
            </button>
          </div>
          {!isCollapsed && tree(p.id, depth + 1)}
        </div>
      )
    })
  }

  return (
    <aside>
      <div className="brand">
        <img src="/favicon.svg" alt="" width="30" height="30" />
        <span>npkn</span>
      </div>
      <label className="search">
        <SearchIcon size={16} />
        <input placeholder="Search notes…" value={query} onChange={e => onQuery(e.target.value)} />
      </label>

      <div className={'nav-item ask-link' + (view.kind === 'ask' ? ' active' : '')} onClick={() => go({ kind: 'ask' })}>
        <span className="nav-avatar">
          <Avatar size={26} mood={displayMood} />
        </span>
        <span className="nav-title">Ask</span>
        <span className={`nav-ask-status ${displayMood}`}>
          <i className="dot" />
          {ASK_STATUS[displayMood]}
        </span>
      </div>
      <div className={'nav-item nav-primary' + (view.kind === 'todos' ? ' active' : '')} onClick={() => go({ kind: 'todos' })}>
        <span className="nav-glyph"><TodosIcon /></span>
        <span className="nav-title">Todos</span>
        {openTodoCount > 0 && <span className="badge">{openTodoCount}</span>}
      </div>
      <div className={'nav-item nav-primary' + (view.kind === 'settings' ? ' active' : '')} onClick={() => go({ kind: 'settings' })}>
        <span className="nav-glyph"><SettingsIcon /></span>
        <span className="nav-title">Settings</span>
      </div>

      <div className="section-head">
        <span>Pages</span>
        <span className="section-actions">
          {parents.length > 0 && (
            <button className="mini" title={allCollapsed ? 'Expand all' : 'Collapse all'} onClick={toggleAll}>
              {allCollapsed ? '⊞' : '⊟'}
            </button>
          )}
          <button className="new-page" title="New page" onClick={() => onAdd(null)}>
            <PlusIcon size={12} /> New
          </button>
        </span>
      </div>

      {results ? (
        results.length ? (
          results.map(p => (
            <div key={p.id} className="nav-item" style={{ paddingLeft: 10 }} onClick={() => go({ kind: 'page', id: p.id })}>
              <span className="nav-glyph"><PageIcon /></span>
              <span className="nav-title">{p.title || 'Untitled'}</span>
            </div>
          ))
        ) : (
          <p className="empty small">No matches</p>
        )
      ) : (
        tree(null)
      )}

      <div className="sidebar-dock">
        <div className="data-actions">
          <button className="dock-btn" onClick={() => importInput.current?.click()} title="Import .md files or an exported bundle (.zip), with optional OKF front matter">
            <ImportIcon /> Import
          </button>
          <button className="dock-btn" onClick={onExportBundle} title="Download every page as an Open Knowledge Format bundle (.zip)">
            <ExportIcon /> Export
          </button>
          <button className="dock-btn" onClick={onLoadSample} title="Add a fictional notebook for trying out Ask (delete the 'Sample notebook' page to remove it)">
            <SampleIcon /> Sample
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".md,.markdown,.zip,text/markdown,application/zip"
            multiple
            hidden
            onChange={e => {
              onImport(e.target.files)
              if (importInput.current) importInput.current.value = ''
            }}
          />
        </div>
        <NotebookFolder />
        <ThemePicker />
      </div>
    </aside>
  )
}
