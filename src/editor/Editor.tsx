import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import { editorExtensions } from './extensions'
import { PageLinks } from './pageLinks'
import { TableBar } from './TableBar'
import { markdownToPage, pastedTableMarkdown } from '../core/markdown'
import type { Page } from '../core/types'
import { updatePage } from '../data/pages'

export function PageEditor({ page }: { page: Page }) {
  const timer = useRef<number>()
  const dirty = useRef(false)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const editor = useEditor({
    editorProps: {
      // Tab-separated text or a markdown table with no HTML <table> beside it (HTML tables, e.g. from
      // Excel or a web page, are handled by the Table node's own parse rules).
      handlePaste: (_view, e) => {
        const cd = e.clipboardData
        if (!cd || /<table/i.test(cd.getData('text/html'))) return false
        const md = pastedTableMarkdown(cd.getData('text/plain'))
        if (!md || !editorRef.current) return false
        e.preventDefault()
        editorRef.current.commands.insertContent(markdownToPage(md, 'paste').content.content ?? [])
        return true
      },
    },
    extensions: [
      ...editorExtensions,
      PageLinks, // interactive only: kept out of the schema list so markdown import stays free of UI code
      Placeholder.configure({ placeholder: 'Start writing…  try ## , - , [] , @work , @fri' }),
    ],
    content: page.content ?? '',
    autofocus: page.content ? false : 'end',
    onUpdate: ({ editor }) => {
      dirty.current = true
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        dirty.current = false
        updatePage(page.id, { content: editor.getJSON() as any })
      }, 300)
    },
  })

  // Flush a pending save on unmount / page switch. Only when something actually changed: saving an
  // untouched page bumps updatedAt and makes lists that depend on it jump around.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (dirty.current && editor && !editor.isDestroyed) {
        dirty.current = false
        updatePage(page.id, { content: editor.getJSON() as any })
      }
    },
    [editor, page.id],
  )

  editorRef.current = editor

  return (
    <>
      {editor && <TableBar editor={editor} />}
      <EditorContent editor={editor} className="editor" />
    </>
  )
}
