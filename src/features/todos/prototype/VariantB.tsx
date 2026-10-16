// B: Board. Three columns by status group, tasks as cards. Answers "where is everything in flight".
import { GROUP_LABEL } from '../../../core/labels'
import { Chips, DueChip, key, type VariantProps } from './shared'
import type { Todo } from '../../../core/todos'

export const name = 'Board'
export const wide = true

export function VariantB({ todos, onToggle, onOpen }: VariantProps) {
  const cols: { id: string; label: string; items: Todo[] }[] = [
    { id: 'todo', label: GROUP_LABEL.todo, items: todos.filter(t => !t.closed && (!t.status || t.status.group === 'todo')) },
    { id: 'active', label: GROUP_LABEL.active, items: todos.filter(t => !t.closed && t.status?.group === 'active') },
    { id: 'done', label: GROUP_LABEL.done, items: todos.filter(t => t.closed) },
  ]
  const byDue = (a: Todo, b: Todo) => (a.date ?? '9999').localeCompare(b.date ?? '9999')
  return (
    <div className="pv-b">
      {cols.map(c => (
        <div key={c.id} className={'pv-b-col col-' + c.id}>
          <h3>
            {c.label} <span>{c.items.length}</span>
          </h3>
          {[...c.items].sort(byDue).map(t => (
            <article key={key(t)} className={'pv-b-card' + (t.closed ? ' closed' : '')}>
              <label className="pv-b-title">
                <input type="checkbox" checked={t.closed} onChange={() => onToggle(t)} />
                <span>{t.text || <em>untitled</em>}</span>
              </label>
              <div className="pv-b-meta">
                <Chips t={t} status={c.id === 'done'} />
              </div>
              <div className="pv-b-foot">
                <DueChip t={t} />
                <button className="src" onClick={() => onOpen(t.pageId)}>{t.pageTitle}</button>
              </div>
            </article>
          ))}
          {c.items.length === 0 && <p className="pv-b-empty">Nothing here</p>}
        </div>
      ))}
    </div>
  )
}
