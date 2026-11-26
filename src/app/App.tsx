import { useCallback, useEffect, useMemo, useState } from 'react'
import { bundleFiles, download, makeZip, planImport, readZip } from '../core/bundle'
import { toISO } from '../core/dates'
import { isFlaggedPrivate, privateIds } from '../core/frontmatter'
import { push, startNav, step } from '../core/history'
import { resolveRelativeLinks } from '../core/links'
import { markdownToPage } from '../core/markdown'
import { searchPages } from '../core/search'
import { extractTodos } from '../core/todos'
import { collectLabels, labelCss, labelOptions, registryFromPages } from '../core/labels'
import { addPage, backfillCreatedAt, dailyPage, deletePageTree, newPage, updatePage, usePages } from '../data/pages'
import { setPageDirectory } from '../editor/pageDirectory'
import { loadSampleNotebook } from '../data/sample'
import { startFolderSync } from '../data/folderSync'
import { ensureWelcome } from '../data/seed'
import { AskView } from '../features/ask/AskView'
import { TodosView } from '../features/todos/TodosView'
import { PageView } from './PageView'
import { QuickSwitcher } from './QuickSwitcher'
import { SettingsView } from './SettingsView'
import { Sidebar, type View } from './Sidebar'
import { isFocusMode, setFocusMode, useFocusMode } from '../ui/display'

const viewKey = (v: View) => (v.kind === 'page' ? `page:${v.id}` : v.kind)

/** App shell: owns navigation and top-level page actions; everything else lives in features. */
export default function App() {
  const pages = usePages()
  // Land on Ask: the assistant is the front door to the notebook, even though the notebook is the product.
  // Back/forward history (Cmd/Ctrl+[ and ]). In memory only; every navigation goes through setView.
  const [nav, setNav] = useState(() => startNav<View>({ kind: 'ask' }))
  const view = nav.stack[nav.at]
  const setView = useCallback((v: View) => setNav(n => push(n, v, viewKey)), [])
  const [query, setQuery] = useState('')
  const focus = useFocusMode()

  const openToday = async () => setView({ kind: 'page', id: await dailyPage(toISO(new Date())) })

  // Cmd+[ / ] aren't bound by the editor (no indent keymap here), so they navigate even while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Popups (find bar, switcher, link editor, suggestions) preventDefault their own Escape, so it closes them first.
      if (e.key === 'Escape' && !e.defaultPrevented && isFocusMode()) return setFocusMode(false)
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (!e.shiftKey && (k === '[' || k === ']')) {
        e.preventDefault()
        const ids = new Set(pages?.map(p => p.id))
        setNav(n => step(n, k === '[' ? -1 : 1, v => v.kind !== 'page' || ids.has(v.id), viewKey))
      } else if (e.shiftKey && k === 'f') {
        e.preventDefault()
        setFocusMode(!isFocusMode())
      } else if (e.shiftKey && k === 'j') {
        e.preventDefault()
        openToday()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages])

  useEffect(() => {
    backfillCreatedAt()
      .then(ensureWelcome)
      .then(id => {
        if (id) setView({ kind: 'page', id })
        // After the seed, so a fresh install's Welcome page lands in the folder like any other page.
        return startFolderSync()
      })
  }, [])

  const openTodoCount = useMemo(() => {
    const today = toISO(new Date())
    return extractTodos(pages ?? [], registryFromPages(pages ?? [])).filter(t => !t.closed && t.date && t.date <= today).length
  }, [pages])

  const labelStyles = useMemo(() => labelCss(registryFromPages(pages ?? [])), [pages])

  const hidden = useMemo(() => privateIds(pages ?? []), [pages])

  // The editor's `[[` picker and link navigation read this; it isn't React state it can subscribe to.
  useEffect(() => {
    setPageDirectory({
      pages: (pages ?? []).map(p => ({ id: p.id, title: p.title || 'Untitled' })),
      labels: labelOptions(registryFromPages(pages ?? []), collectLabels(pages ?? [])),
      navigate: id => setView({ kind: 'page', id }),
      create: async title => {
        const p = newPage(null, title)
        await addPage(p)
        return { id: p.id, title: p.title }
      },
    })
  }, [pages])

  if (!pages) return null

  const open = (id: string) => setView({ kind: 'page', id })

  const add = async (parentId: string | null) => {
    const p = newPage(parentId)
    await addPage(p)
    open(p.id)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this page and its sub-pages?')) return
    await deletePageTree(id)
    setView({ kind: 'todos' })
  }

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    // Everything becomes {path, parent, text}; zips carry their folder hierarchy, loose .md don't.
    const planned: { path: string; parent: string | null; text: string }[] = []
    for (const f of Array.from(files)) {
      if (/\.zip$/i.test(f.name)) {
        try {
          planned.push(...planImport(await readZip(await f.arrayBuffer())).map(p => ({ ...p, path: `${f.name}/${p.path}`, parent: p.parent && `${f.name}/${p.parent}` })))
        } catch (e) {
          alert(`Couldn't read ${f.name}: ${(e as Error).message}`)
        }
      } else {
        planned.push({ path: f.name, parent: null, text: await f.text() })
      }
    }

    const ids = new Map<string, string>()
    const created: { id: string; path: string; content: NonNullable<ReturnType<typeof markdownToPage>['content']> }[] = []
    const base = Date.now()
    let lastTop: string | null = null
    for (const [i, item] of planned.entries()) {
      const imp = markdownToPage(item.text, item.path.split('/').pop() ?? item.path)
      const parentId = item.parent ? (ids.get(item.parent) ?? null) : null
      const p = { ...newPage(parentId, imp.title), content: imp.content, frontmatter: imp.frontmatter, createdAt: base + i }
      await addPage(p)
      ids.set(item.path, p.id)
      created.push({ id: p.id, path: item.path, content: imp.content })
      if (!parentId) lastTop = p.id
    }

    // Links between the imported files (`[Plan](../projects/plan.md)`) become links between the pages.
    for (const c of created) {
      const r = resolveRelativeLinks(c.content, c.path, ids)
      if (r.changed) await updatePage(c.id, { content: r.doc })
    }
    if (lastTop) open(lastTop)
  }

  const page = view.kind === 'page' ? pages.find(p => p.id === view.id) : null

  return (
    <div className="app">
      <style>{labelStyles}</style>
      <QuickSwitcher
        pages={pages}
        recent={nav.recent.flatMap(v => (v.kind === 'page' && viewKey(v) !== viewKey(view) ? [v.id] : []))}
        onOpen={open}
        onCreate={async title => {
          const p = newPage(null, title)
          await addPage(p)
          open(p.id)
        }}
      />
      <Sidebar
        pages={pages}
        view={view}
        query={query}
        results={query.trim() ? searchPages(pages, query) : null}
        openTodoCount={openTodoCount}
        privateIds={hidden}
        onQuery={setQuery}
        onView={setView}
        onAdd={add}
        onImport={importFiles}
        onExportBundle={() => download('notes-okf.zip', makeZip(bundleFiles(pages)))}
        onLoadSample={async () => open(await loadSampleNotebook())}
        onToday={openToday}
      />

      <main>
        {focus && (
          <button className="focus-exit" onClick={() => setFocusMode(false)} title="Exit focus mode (Escape)">
            Exit focus
          </button>
        )}
        {view.kind === 'ask' && <AskView pages={pages} onOpen={open} onOpenSettings={() => setView({ kind: 'settings' })} />}
        {view.kind === 'settings' && <SettingsView pages={pages} />}
        {view.kind === 'todos' && <TodosView pages={pages} onOpen={open} />}
        {page && (
          <PageView
            key={page.id}
            page={page}
            pages={pages}
            onOpen={open}
            onDelete={remove}
            inheritedPrivate={hidden.has(page.id) && !isFlaggedPrivate(page.frontmatter)}
          />
        )}
        {view.kind === 'page' && !page && <p className="empty">Page not found.</p>}
      </main>
    </div>
  )
}
