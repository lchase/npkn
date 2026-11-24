import { markdownToPage } from '../../core/markdown'
import { appendToDoc, replaceInDoc, type Edit } from '../../core/noteEdits'
import { addPage, getPage, newPage, updatePage } from '../../data/pages'
import type { Source } from './retrieve'

export type Applied = { ok: true; pageId: string; title: string } | { ok: false; message: string }

/**
 * Carry out one approved edit. Existing pages are re-read from the store at this moment, not taken from the
 * prompt, so a note edited since the question was asked is changed as it is NOW (or refused if the text moved).
 * Only called from an explicit click on a card; nothing writes on its own.
 */
export async function applyEdit(edit: Edit, sources: Source[]): Promise<Applied> {
  try {
    if (edit.op === 'create') {
      const imp = markdownToPage(edit.body, edit.title)
      const page = { ...newPage(null, edit.title), content: imp.content, frontmatter: imp.frontmatter }
      await addPage(page)
      return { ok: true, pageId: page.id, title: page.title }
    }
    if (edit.op === 'invalid') return { ok: false, message: "That proposed change couldn't be read." }

    const src = sources.find(s => s.n === edit.page)
    const page = src && (await getPage(src.pageId))
    if (!page) return { ok: false, message: `Note [${edit.page}] no longer exists.` }

    if (edit.op === 'append') {
      const blocks = markdownToPage(edit.body, page.title).content.content ?? []
      await updatePage(page.id, { content: appendToDoc(page.content, blocks) })
    } else {
      const r = replaceInDoc(page.content, edit.find, edit.with)
      if (!r.ok) return { ok: false, message: r.reason }
      await updatePage(page.id, { content: r.doc })
    }
    return { ok: true, pageId: page.id, title: page.title || 'Untitled' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
