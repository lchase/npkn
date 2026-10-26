import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'
import { TableIcon } from '../ui/icons'

/**
 * Page toolbar. Only tables so far: "Table" inserts one, and the rest appear while the caret is inside
 * one. Buttons keep editor focus (mousedown is cancelled), otherwise the click would blur the selection
 * and the command would act on nothing.
 */
export function TableBar({ editor }: { editor: Editor }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    editor.on('transaction', rerender)
    return () => void editor.off('transaction', rerender)
  }, [editor])

  const chain = () => editor.chain().focus()
  const Btn = ({ label, run, danger, title, icon }: { label: string; run: () => void; danger?: boolean; title?: string; icon?: React.ReactNode }) => (
    <button className={'dock-btn' + (danger ? ' danger' : '')} title={title} onMouseDown={e => e.preventDefault()} onClick={run}>
      {icon}
      {label}
    </button>
  )

  return (
    <div className="editor-bar" role="toolbar" aria-label="Page tools">
      <Btn label="Table" icon={<TableIcon />} title="Insert a 3×3 table" run={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {editor.isActive('table') && (
        <>
          <span className="editor-bar-sep" />
          <Btn label="+ Row" title="Add row below" run={() => chain().addRowAfter().run()} />
          <Btn label="+ Column" title="Add column right" run={() => chain().addColumnAfter().run()} />
          <Btn label="Header row" title="Toggle header row" run={() => chain().toggleHeaderRow().run()} />
          <Btn label="− Row" danger run={() => chain().deleteRow().run()} />
          <Btn label="− Column" danger run={() => chain().deleteColumn().run()} />
          <Btn label="Delete table" danger run={() => chain().deleteTable().run()} />
        </>
      )}
    </div>
  )
}
