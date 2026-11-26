import { useEffect, useReducer, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import { findKey, getFind, type FindMeta } from './findInPage'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from '../ui/icons'

/** Find in the current page (Cmd/Ctrl+F). Highlights come from the FindInPage plugin; this only drives it. */
export function FindBar({ editor, inputRef, onClose }: { editor: Editor; inputRef: RefObject<HTMLInputElement>; onClose: () => void }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    editor.on('transaction', rerender)
    return () => void editor.off('transaction', rerender)
  }, [editor])

  const send = (meta: FindMeta) => {
    editor.view.dispatch(editor.state.tr.setMeta(findKey, meta))
    editor.view.dom.querySelector('.find-hit.current')?.scrollIntoView({ block: 'center' })
  }

  const close = () => {
    const { matches, current } = getFind(editor.state)
    const hit = matches[current]
    onClose() // unmount clears the highlights
    if (hit) editor.chain().focus().setTextSelection(hit).run()
    else editor.commands.focus()
  }

  // Clear the highlights whenever the bar goes away (close, page switch).
  useEffect(() => () => void (!editor.isDestroyed && editor.view.dispatch(editor.state.tr.setMeta(findKey, { query: '' }))), [editor])

  const { query, matches, current } = getFind(editor.state)
  const count = !query ? '' : matches.length ? `${current + 1} of ${matches.length}` : 'No results'

  return (
    <div className="find-anchor">
      <div className="find-bar" role="search">
        <input
          ref={inputRef}
          autoFocus
          aria-label="Find in page"
          placeholder="Find in page"
          defaultValue={query}
          onChange={e => send({ query: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.preventDefault(), send({ step: e.shiftKey ? -1 : 1 }))
            else if (e.key === 'Escape') (e.preventDefault(), close())
          }}
        />
        <span className="find-count" aria-live="polite">{count}</span>
        <button title="Previous (Shift+Enter)" aria-label="Previous match" disabled={!matches.length} onClick={() => send({ step: -1 })}>
          <ChevronUpIcon size={14} />
        </button>
        <button title="Next (Enter)" aria-label="Next match" disabled={!matches.length} onClick={() => send({ step: 1 })}>
          <ChevronDownIcon size={14} />
        </button>
        <button title="Close (Escape)" aria-label="Close find" onClick={close}>
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
  )
}
