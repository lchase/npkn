// A: Agenda. A date rail on the left, tasks on the right; overdue pinned on top. Answers "what's next".
import { toISO } from '../../../core/dates'
import { Chips, key, type VariantProps } from './shared'
import type { Todo } from '../../../core/todos'

export const name = 'Agenda'

const day = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return { wk: d.toLocaleDateString(undefined, { weekday: 'short' }), n: d.getDate(), mo: d.toLocaleDateString(undefined, { month: 'short' }) }
}

export function VariantA({ todos, onToggle, onOpen }: VariantProps) {
  const today = toISO(new Date())
  const open = todos.filter(t => !t.closed)
  const cmp = (a: Todo, b: Todo) => (a.date ?? '').localeCompare(b.date ?? '')
  const overdue = open.filter(t => t.date && t.date < today).sort(cmp)
  const dated = open.filter(t => t.date && t.date >= today).sort(cmp)
  const someday = open.filter(t => !t.date)
  const days = [...new Set(dated.map(t => t.date!))]
  const dueToday = dated.filter(t => t.date === today).length

  const row = (t: Todo) => (
    <div key={key(t)} className="pv-a-row">
      <input type="checkbox" checked={t.closed} onChange={() => onToggle(t)} />
      <span className="pv-a-text">{t.text || <em>untitled</em>}</span>
      <Chips t={t} />
      <button className="src" onClick={() => onOpen(t.pageId)}>{t.pageTitle}</button>
    </div>
  )

  return (
    <div className="pv-a">
      <p className="pv-a-summary">
        <strong>{dueToday}</strong> due today · <strong className={overdue.length ? 'bad' : ''}>{overdue.length}</strong> overdue · {open.length} open
      </p>
      {overdue.length > 0 && (
        <section className="pv-a-overdue">
          <div className="pv-a-rail"><span className="pv-a-big bad">!</span><span className="pv-a-sub">Overdue</span></div>
          <div className="pv-a-list">{overdue.map(row)}</div>
        </section>
      )}
      {days.map(iso => {
        const d = day(iso)
        return (
          <section key={iso} className={'pv-a-day' + (iso === today ? ' today' : '')}>
            <div className="pv-a-rail">
              <span className="pv-a-sub">{iso === today ? 'Today' : d.wk}</span>
              <span className="pv-a-big">{d.n}</span>
              <span className="pv-a-sub">{d.mo}</span>
            </div>
            <div className="pv-a-list">{dated.filter(t => t.date === iso).map(row)}</div>
          </section>
        )
      })}
      {someday.length > 0 && (
        <section className="pv-a-day">
          <div className="pv-a-rail"><span className="pv-a-big">∞</span><span className="pv-a-sub">Someday</span></div>
          <div className="pv-a-list">{someday.map(row)}</div>
        </section>
      )}
    </div>
  )
}
