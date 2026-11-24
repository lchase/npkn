import type { Edit } from '../../core/noteEdits'
import { Markdown } from './Markdown'
import type { Source } from './retrieve'
import type { EditState } from './store'

/** One proposed change, with Save / Discard. Rendered only once the reply has finished streaming. */
export function EditCard({
  edit,
  state,
  sources,
  onSave,
  onDiscard,
  onOpen,
}: {
  edit: Edit
  state?: EditState
  sources: Source[]
  onSave: () => void
  onDiscard: () => void
  onOpen: (id: string) => void
}) {
  const target = edit.op === 'append' || edit.op === 'replace' ? sources.find(s => s.n === edit.page) : undefined
  const needsTarget = edit.op === 'append' || edit.op === 'replace'
  const unusable = edit.op === 'invalid' || (needsTarget && !target)
  const heading =
    edit.op === 'create'
      ? `New note: ${edit.title}`
      : edit.op === 'append'
        ? `Add to “${target?.title ?? 'unknown note'}”`
        : edit.op === 'replace'
          ? `Change in “${target?.title ?? 'unknown note'}”`
          : "Couldn't read this proposed change"

  return (
    <div className={'edit-card' + (state ? ` ${state.status}` : '')}>
      <div className="edit-head">{heading}</div>
      {edit.op === 'create' || edit.op === 'append' ? (
        <div className="edit-body"><Markdown text={edit.body} /></div>
      ) : edit.op === 'replace' ? (
        <div className="edit-diff">
          <del>{edit.find}</del>
          <ins>{edit.with || '(removed)'}</ins>
        </div>
      ) : (
        <pre className="edit-raw">{edit.raw}</pre>
      )}
      {state?.status === 'saved' ? (
        <div className="edit-foot">
          Saved ·{' '}
          <button className="linklike" onClick={() => onOpen(state.pageId)}>
            Open “{state.title}”
          </button>
        </div>
      ) : state?.status === 'discarded' ? (
        <div className="edit-foot">Discarded</div>
      ) : state?.status === 'failed' ? (
        <div className="edit-foot error">Not saved: {state.message}</div>
      ) : state?.status === 'saving' ? (
        <div className="edit-foot">Saving…</div>
      ) : (
        <div className="edit-actions">
          <button type="button" onClick={onSave} disabled={unusable}>
            Save
          </button>
          <button type="button" className="ghost" onClick={onDiscard}>
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
