// PROTOTYPE: throwaway Todos layouts. Delete this folder once a layout is chosen.
import type { Todo } from '../../../core/todos'
import { isOverdue, relativeLabel } from '../../../core/dates'
import { hueFor } from '../../../editor/chip'

export interface VariantProps {
  /** Every todo, closed ones included. Each variant decides what to show. */
  todos: Todo[]
  onToggle: (t: Todo) => void
  onOpen: (pageId: string) => void
}

export const key = (t: Todo) => t.pageId + ':' + t.index

export function Chips({ t, status = true }: { t: Todo; status?: boolean }) {
  return (
    <>
      {status && t.status && (
        <span className="chip chip-category" data-label={t.status.label.toLowerCase()} style={{ ['--h' as any]: hueFor(t.status.label) }}>
          {t.status.label}
        </span>
      )}
      {t.categories.map(c => (
        <span key={c} className="chip chip-category" data-label={c.toLowerCase()} style={{ ['--h' as any]: hueFor(c) }}>
          {c}
        </span>
      ))}
    </>
  )
}

export const DueChip = ({ t }: { t: Todo }) =>
  t.date ? <span className={'chip chip-date' + (isOverdue(t.date) ? ' overdue' : '')}>{relativeLabel(t.date)}</span> : null
