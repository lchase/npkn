import { useMemo, useState } from 'react'
import type { Page } from '../../core/types'
import { updatePage } from '../../data/pages'
import { GROUP_LABEL, registryFromPages, statusList, type Group } from '../../core/labels'
import { extractTodos, setTodoClosed, type Todo } from '../../core/todos'
import { isOverdue, relativeLabel, toISO } from '../../core/dates'
import { hueFor } from '../../editor/chip'

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

  const facets = useMemo(() => {
    const open = all.filter(t => showDone || !t.closed)
    const tally = (pick: (t: Todo) => string[]) => {
      const m = new Map<string, number>()
      for (const t of open) for (const k of pick(t)) m.set(k, (m.get(k) ?? 0) + 1)
      return m
    }
    const st = tally(t => (t.status ? [t.status.label.toLowerCase()] : []))
    const cats = tally(t => t.categories)
    return {
      // Statuses keep the registry's order (to do, doing, done...); labels go most-used first.
      statuses: order.filter(s => st.has(s)).map(s => [s, st.get(s)!] as const),
      labels: [...cats].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    }
  }, [all, order, showDone])

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

  const chip = (label: string) => (
    <span className="chip chip-category" data-label={label.toLowerCase()} style={{ ['--h' as any]: hueFor(label) }}>
      {label}
    </span>
  )

  return (
    <div className="todos">
      <h1>Todos</h1>

      <div className="todos-body">
        <div className="todos-rail">
          <div className="seg" role="group" aria-label="Group by">
            <button className={by === 'date' ? 'on' : ''} onClick={() => setBy('date')}>By date</button>
            <button className={by === 'status' ? 'on' : ''} onClick={() => setBy('status')}>By status</button>
          </div>

          {facets.statuses.length > 0 && (
            <div className="facet">
              <h4>Status</h4>
              {facets.statuses.map(([s, n]) => (
                <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(status === s ? null : s)}>
                  {chip(s)}
                  <em>{n}</em>
                </button>
              ))}
            </div>
          )}

          {facets.labels.length > 0 && (
            <div className="facet">
              <h4>Labels</h4>
              {facets.labels.map(([c, n]) => (
                <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? null : c)}>
                  {chip(c)}
                  <em>{n}</em>
                </button>
              ))}
            </div>
          )}

          <label className="done-toggle">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> show done
          </label>
        </div>

        <div className="todos-main">
          {sections.length === 0 && <p className="empty">Nothing here. Add a todo in any page with <code>[]</code>.</p>}
          {sections.length > 0 && (
            <table className="todos-table">
              <thead>
                <tr>
                  <th className="chk" />
                  <th>Task</th>
                  <th>Labels</th>
                  <th>Due</th>
                  <th>Page</th>
                </tr>
              </thead>
              {sections.map(g => (
                <tbody key={g.key}>
                  <tr className={'sect' + (g.tone === 'overdue' ? ' overdue' : '')}>
                    <th colSpan={5}>
                      {g.label} <span>{g.items.length}</span>
                    </th>
                  </tr>
                  {g.items.map(t => (
                    <tr key={t.pageId + t.index} className={t.closed ? 'checked' : ''}>
                      <td className="chk"><input type="checkbox" checked={t.closed} onChange={() => toggle(t)} /></td>
                      <td className="todo-text">{t.text || <em>untitled</em>}</td>
                      <td>
                        {t.status && chip(t.status.label)}
                        {t.categories.map(c => <span key={c}>{chip(c)}</span>)}
                      </td>
                      <td>
                        {t.date && <span className={'chip chip-date' + (isOverdue(t.date) ? ' overdue' : '')}>{relativeLabel(t.date)}</span>}
                      </td>
                      <td><button className="src" onClick={() => onOpen(t.pageId)}>{t.pageTitle}</button></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
