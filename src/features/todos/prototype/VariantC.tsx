// C: Table with a filter rail. Dense, sortable, everything visible at once. Answers "find and slice".
import { useMemo, useState } from 'react'
import { Chips, DueChip, key, type VariantProps } from './shared'
import type { Todo } from '../../../core/todos'

export const name = 'Table'
export const wide = true

type Sort = 'due' | 'task' | 'page' | 'status'

export function VariantC({ todos, onToggle, onOpen }: VariantProps) {
  const [sort, setSort] = useState<Sort>('due')
  const [label, setLabel] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  const count = (pick: (t: Todo) => string[]) => {
    const m = new Map<string, number>()
    for (const t of todos.filter(t => showDone || !t.closed)) for (const k of pick(t)) m.set(k, (m.get(k) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }
  const labels = count(t => t.categories)
  const statuses = count(t => (t.status ? [t.status.label.toLowerCase()] : []))

  const rows = useMemo(() => {
    const f = todos.filter(
      t =>
        (showDone || !t.closed) &&
        (!label || t.categories.includes(label)) &&
        (!status || t.status?.label.toLowerCase() === status),
    )
    const k: Record<Sort, (t: Todo) => string> = {
      due: t => t.date ?? '9999',
      task: t => t.text.toLowerCase(),
      page: t => t.pageTitle.toLowerCase(),
      status: t => t.status?.label ?? '~',
    }
    return [...f].sort((a, b) => k[sort](a).localeCompare(k[sort](b)))
  }, [todos, sort, label, status, showDone])

  const th = (s: Sort, text: string) => (
    <th className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
      {text}
      {sort === s ? ' ↓' : ''}
    </th>
  )

  const facet = (title: string, items: [string, number][], cur: string | null, set: (v: string | null) => void) => (
    <div className="pv-c-facet">
      <h4>{title}</h4>
      {items.map(([k, n]) => (
        <button key={k} className={cur === k ? 'on' : ''} onClick={() => set(cur === k ? null : k)}>
          <span>{k}</span>
          <em>{n}</em>
        </button>
      ))}
    </div>
  )

  return (
    <div className="pv-c">
      <div className="pv-c-rail">
        {statuses.length > 0 && facet('Status', statuses, status, setStatus)}
        {facet('Labels', labels, label, setLabel)}
        <label className="done-toggle">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> show done
        </label>
      </div>
      <table className="pv-c-table">
        <thead>
          <tr>
            <th className="chk" />
            {th('task', 'Task')}
            {th('status', 'Labels')}
            {th('due', 'Due')}
            {th('page', 'Page')}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={key(t)} className={t.closed ? 'closed' : ''}>
              <td className="chk"><input type="checkbox" checked={t.closed} onChange={() => onToggle(t)} /></td>
              <td>{t.text || <em>untitled</em>}</td>
              <td><Chips t={t} /></td>
              <td><DueChip t={t} /></td>
              <td><button className="src" onClick={() => onOpen(t.pageId)}>{t.pageTitle}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No todos match.</p>}
    </div>
  )
}
