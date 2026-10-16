import { useMemo, useState } from 'react'
import type { Page } from '../../core/types'
import { updatePage } from '../../data/pages'
import { GROUP_LABEL, registryFromPages, statusList, type Group } from '../../core/labels'
import { extractTodos, setTodoClosed, type Todo } from '../../core/todos'
import { isOverdue, relativeLabel, toISO } from '../../core/dates'
import { hueFor } from '../../editor/chip'
// PROTOTYPE: layout options for this page, switched with ?variant=A|B|C (dev builds only). Remove with ./prototype.
import './prototype/prototype.css'
import { PrototypeSwitcher } from './prototype/PrototypeSwitcher'
import * as A from './prototype/VariantA'
import * as B from './prototype/VariantB'
import * as C from './prototype/VariantC'

const VARIANTS = [
  { id: 'current', label: 'Current' },
  { id: 'A', label: A.name },
  { id: 'B', label: B.name },
  { id: 'C', label: C.name },
]
const readVariant = () => {
  const v = new URLSearchParams(location.search).get('variant') ?? 'current'
  return VARIANTS.some(x => x.id === v) ? v : 'current'
}

type Section = { key: string; label: string; items: Todo[]; tone?: 'overdue' }
type By = 'date' | 'status'

const BY_KEY = 'npkn.todoGroup'
const loadBy = (): By => {
  try {
    return localStorage.getItem(BY_KEY) === 'status' ? 'status' : 'date'
  } catch {
    return 'date'
  }
}

function byDate(todos: Todo[]): Section[] {
  const today = toISO(new Date())
  const g: Record<string, Todo[]> = { overdue: [], today: [], upcoming: [], none: [] }
  for (const t of todos) {
    if (!t.date) g.none.push(t)
    else if (t.date < today) g.overdue.push(t)
    else if (t.date === today) g.today.push(t)
    else g.upcoming.push(t)
  }
  const cmp = (a: Todo, b: Todo) => (a.date ?? '').localeCompare(b.date ?? '')
  g.overdue.sort(cmp)
  g.upcoming.sort(cmp)
  return [
    { key: 'overdue', label: 'Overdue', items: g.overdue, tone: 'overdue' as const },
    { key: 'today', label: 'Today', items: g.today },
    { key: 'upcoming', label: 'Upcoming', items: g.upcoming },
    { key: 'none', label: 'No date', items: g.none },
  ].filter(x => x.items.length)
}

function byStatus(todos: Todo[], order: string[]): Section[] {
  const rank = (t: Todo) => (t.status ? Math.max(0, order.indexOf(t.status.label.toLowerCase())) : 0)
  const by = (a: Todo, b: Todo) => rank(a) - rank(b) || (a.date ?? '9999').localeCompare(b.date ?? '9999')
  const group = (g: Group) => todos.filter(t => !t.closed && t.status?.group === g).sort(by)
  return [
    { key: 'active', label: GROUP_LABEL.active, items: group('active') },
    // Open todos with no status are simply "to do".
    {
      key: 'todo',
      label: GROUP_LABEL.todo,
      items: todos.filter(t => !t.closed && (!t.status || t.status.group === 'todo')).sort(by),
    },
    { key: 'done', label: GROUP_LABEL.done, items: todos.filter(t => t.closed) },
  ].filter(x => x.items.length)
}

export function TodosView({ pages, onOpen }: { pages: Page[]; onOpen: (id: string) => void }) {
  const [cat, setCat] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [by, setByState] = useState<By>(loadBy)
  const [variant, setVariantState] = useState(import.meta.env.DEV ? readVariant : () => 'current')
  const setVariant = (v: string) => {
    setVariantState(v)
    const u = new URL(location.href)
    u.searchParams.set('variant', v)
    history.replaceState(null, '', u)
  }

  const setBy = (b: By) => {
    setByState(b)
    try {
      localStorage.setItem(BY_KEY, b)
    } catch {
      /* ignore */
    }
  }

  const registry = useMemo(() => registryFromPages(pages), [pages])
  const all = useMemo(() => extractTodos(pages, registry), [pages, registry])
  const order = useMemo(() => statusList(registry).map(s => s.label), [registry])

  const categories = useMemo(() => [...new Set(all.flatMap(t => t.categories))].sort(), [all])
  const statuses = useMemo(() => {
    const used = new Set(all.flatMap(t => (t.status ? [t.status.label.toLowerCase()] : [])))
    return order.filter(s => used.has(s))
  }, [all, order])

  const visible = all.filter(
    t =>
      (showDone || !t.closed) &&
      (!cat || t.categories.includes(cat)) &&
      (!status || t.status?.label.toLowerCase() === status),
  )
  const sections = by === 'date' ? byDate(visible) : byStatus(visible, order)

  const toggle = async (t: Todo) => {
    const page = pages.find(p => p.id === t.pageId)
    if (!page?.content) return
    await updatePage(page.id, { content: setTodoClosed(page, t.index, !t.closed, registry) })
  }

  const proto = { todos: all, onToggle: toggle, onOpen }
  const wide = (variant === 'B' && B.wide) || (variant === 'C' && C.wide)
  if (variant !== 'current') {
    return (
      <div className={'todos' + (wide ? ' pv-wide' : '')}>
        <h1>Todos</h1>
        {variant === 'A' && <A.VariantA {...proto} />}
        {variant === 'B' && <B.VariantB {...proto} />}
        {variant === 'C' && <C.VariantC {...proto} />}
        <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
      </div>
    )
  }

  return (
    <div className="todos">
      {import.meta.env.DEV && <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />}
      <h1>Todos</h1>

      <div className="todos-controls">
        <div className="seg" role="group" aria-label="Group by">
          <button className={by === 'date' ? 'on' : ''} onClick={() => setBy('date')}>By date</button>
          <button className={by === 'status' ? 'on' : ''} onClick={() => setBy('status')}>By status</button>
        </div>
        <label className="done-toggle">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> show done
        </label>
      </div>

      {statuses.length > 0 && (
        <div className="filters">
          <span className="filters-label">Status</span>
          <button className={!status ? 'on' : ''} onClick={() => setStatus(null)}>Any</button>
          {statuses.map(s => (
            <button
              key={s}
              className={'filter-status' + (status === s ? ' on' : '')}
              data-label={s}
              onClick={() => setStatus(status === s ? null : s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="filters">
        <span className="filters-label">Label</span>
        <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>All</button>
        {categories.map(c => (
          <button
            key={c}
            className={'filter-cat' + (cat === c ? ' on' : '')}
            data-label={c.toLowerCase()}
            style={{ ['--h' as any]: hueFor(c) }}
            onClick={() => setCat(cat === c ? null : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {sections.length === 0 && <p className="empty">Nothing here. Add a todo in any page with <code>[]</code>.</p>}

      {sections.map(g => (
        <section key={g.key}>
          <h3 className={g.tone === 'overdue' ? 'overdue' : ''}>
            {g.label} <span>{g.items.length}</span>
          </h3>
          {g.items.map(t => (
            <div key={t.pageId + t.index} className={'todo' + (t.closed ? ' checked' : '')}>
              <input type="checkbox" checked={t.closed} onChange={() => toggle(t)} />
              <span className="todo-text">{t.text || <em>untitled</em>}</span>
              {t.status && (
                <span className="chip chip-category" data-label={t.status.label.toLowerCase()} style={{ ['--h' as any]: hueFor(t.status.label) }}>
                  {t.status.label}
                </span>
              )}
              {t.categories.map(c => (
                <span key={c} className="chip chip-category" data-label={c.toLowerCase()} style={{ ['--h' as any]: hueFor(c) }}>
                  {c}
                </span>
              ))}
              {t.date && <span className={'chip chip-date' + (isOverdue(t.date) ? ' overdue' : '')}>{relativeLabel(t.date)}</span>}
              <button className="src" onClick={() => onOpen(t.pageId)}>{t.pageTitle}</button>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
