import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { getMarkRange } from '@tiptap/core'

export interface LinkTarget {
  from: number
  to: number
  text: string
  href: string
  x: number
  y: number
}

/** Read the link under the selection (or the bare selection) and where to anchor the popover. */
export function linkTargetAt(editor: Editor): LinkTarget {
  const { state, view } = editor
  const { from, to, empty, $from } = state.selection
  const type = state.schema.marks.link
  const range = empty ? getMarkRange($from, type) : null
  const [a, b] = range ? [range.from, range.to] : [from, to]
  const mark = state.doc.rangeHasMark(a, Math.max(b, a + 1), type)
    ? state.doc.nodeAt(a)?.marks.find(m => m.type === type)
    : undefined
  const at = view.coordsAtPos(a)
  return {
    from: a,
    to: b,
    text: state.doc.textBetween(a, b),
    href: String(mark?.attrs.href ?? ''),
    x: at.left,
    y: at.bottom + 6,
  }
}

/** Only schemes that are safe to follow. A bare "example.com" gets https://. Empty = no link. */
export function cleanHref(raw: string): string | null {
  const v = raw.trim()
  if (!v) return ''
  if (/^(\/|\.\/|\.\.\/|#)/.test(v)) return v
  try {
    // Allowlist on the parsed scheme, never a regex guess ("javascript:1,x//a.md" fooled one).
    return ['http:', 'https:', 'mailto:', 'npkn:'].includes(new URL(v).protocol) ? v : null
  } catch {
    // Not absolute: a relative .md path stays as is (only when it has no scheme), else assume a host.
    if (v.endsWith('.md') && !/^[a-z][a-z0-9+.-]*:/i.test(v)) return v
    try {
      return new URL('https://' + v).href
    } catch {
      return null
    }
  }
}

export function LinkEditor({ editor, target, onClose }: { editor: Editor; target: LinkTarget; onClose: () => void }) {
  const [text, setText] = useState(target.text)
  const [href, setHref] = useState(target.href)
  const urlInput = useRef<HTMLInputElement>(null)
  const bad = cleanHref(href) === null

  useEffect(() => {
    urlInput.current?.focus()
    urlInput.current?.select()
  }, [])

  const apply = () => {
    const url = cleanHref(href)
    if (url === null) return
    const label = text.trim() || url
    const chain = editor.chain().focus()
    if (!label) chain.deleteRange({ from: target.from, to: target.to }).run()
    else
      chain
        .insertContentAt(
          { from: target.from, to: target.to },
          { type: 'text', text: label, marks: url ? [{ type: 'link', attrs: { href: url } }] : [] },
        )
        .run()
    onClose()
  }

  const remove = () => {
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).unsetLink().run()
    onClose()
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.preventDefault(), apply())
    if (e.key === 'Escape') (e.preventDefault(), onClose(), editor.commands.focus())
  }

  return (
    <div className="link-editor" style={{ left: Math.max(8, target.x), top: target.y }} onKeyDown={keys}>
      <label>
        Text
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Shown in the note" />
      </label>
      <label>
        Link
        <input ref={urlInput} value={href} onChange={e => setHref(e.target.value)} placeholder="https://…" className={bad ? 'bad' : ''} />
      </label>
      <div className="link-editor-actions">
        {target.href && (
          <button type="button" onClick={remove}>
            Remove link
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={bad} onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  )
}
