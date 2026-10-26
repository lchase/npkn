import { useEffect, useRef } from 'react'
import type { Page } from '../core/types'
import { download, fileSlug } from '../core/bundle'
import { backlinks, fileLinkMapper } from '../core/links'
import { pageToMarkdown } from '../core/markdown'
import { isPinned } from '../core/frontmatter'
import { planPaths, stripYamlKey, upsertYamlKey } from '../core/notefile'
import { updatePage } from '../data/pages'
import { PageEditor } from '../editor/Editor'
import { PageProperties } from '../editor/PageProperties'
import { ExportIcon, PinIcon, TrashIcon } from '../ui/icons'

export function PageView({
  page,
  pages,
  onOpen,
  onDelete,
  inheritedPrivate,
}: {
  page: Page
  pages: Page[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  inheritedPrivate: boolean
}) {
  // The tree is alphabetical, so committing the title on every keystroke would make the page jump
  // around the sidebar while you type. Commit after a pause, and on blur or leaving the page.
  const pending = useRef<{ timer?: number; value?: string }>({})
  const commitTitle = () => {
    window.clearTimeout(pending.current.timer)
    if (pending.current.value !== undefined) {
      updatePage(page.id, { title: pending.current.value })
      pending.current.value = undefined
    }
  }
  useEffect(() => commitTitle, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A lone file still gets working relative links: paths are where each page would sit in a bundle.
  const exportPage = () => {
    const paths = planPaths(pages, new Map())
    const self = paths.get(page.id) ?? `${fileSlug(page.title)}.md`
    const text = pageToMarkdown(page, { linkHref: fileLinkMapper(self, id => paths.get(id)) })
    download(`${fileSlug(page.title)}.md`, new Blob([text], { type: 'text/markdown' }))
  }

  const pinned = isPinned(page.frontmatter)
  const togglePin = () => {
    const text = page.frontmatter ?? ''
    const next = pinned ? stripYamlKey(text, 'pinned') : upsertYamlKey(text.trim() ? text : 'type: note\n', 'pinned', 'true')
    updatePage(page.id, { frontmatter: next.trim() ? next : undefined })
  }

  const linkedFrom = backlinks(pages, page.id).sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="page">
      <div className="page-head">
        <input
          className="title"
          placeholder="Untitled"
          defaultValue={page.title}
          onChange={e => {
            pending.current.value = e.target.value
            window.clearTimeout(pending.current.timer)
            pending.current.timer = window.setTimeout(commitTitle, 700)
          }}
          onBlur={commitTitle}
        />
        <div className="page-actions">
          <button className="dock-btn" onClick={togglePin} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Pin to sidebar'}>
            <PinIcon /> {pinned ? 'Pinned' : 'Pin'}
          </button>
          <button className="dock-btn" onClick={exportPage} title="Download as .md with front matter">
            <ExportIcon /> Export .md
          </button>
          <button className="dock-btn danger" onClick={() => onDelete(page.id)}>
            <TrashIcon /> Delete
          </button>
        </div>
      </div>
      <PageProperties page={page} inheritedPrivate={inheritedPrivate} />
      <PageEditor page={page} />

      {linkedFrom.length > 0 && (
        <section className="backlinks" aria-label="Linked from">
          <h4>Linked from</h4>
          <ul>
            {linkedFrom.map(p => (
              <li key={p.id}>
                <button onClick={() => onOpen(p.id)}>{p.title || 'Untitled'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
