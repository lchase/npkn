import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { findMatches } from '../core/find'

export type FindState = { query: string; current: number; matches: { from: number; to: number }[]; decos: DecorationSet }

export const findKey = new PluginKey<FindState>('findInPage')

/**
 * Searches each textblock's text, so a match can cross marks (bold, links) but not blocks. Inline leaves
 * (chips, hard breaks) are size 1 and read as one placeholder char, which keeps text offsets equal to
 * document offsets inside the block and stops a match running across them.
 */
function search(doc: PMNode, query: string) {
  const matches: FindState['matches'] = []
  if (!query) return matches
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, undefined, '￼')
    for (const [a, b] of findMatches(text, query)) matches.push({ from: pos + 1 + a, to: pos + 1 + b })
    return false
  })
  return matches
}

function build(doc: PMNode, query: string, current: number): FindState {
  const matches = search(doc, query)
  const cur = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : 0
  const decos = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === cur ? 'find-hit current' : 'find-hit' })),
  )
  return { query, current: cur, matches, decos }
}

/** Meta for findKey: set the query (current goes to the first match) or step to the next/previous one. */
export type FindMeta = { query: string } | { step: 1 | -1 }

export const getFind = (state: EditorState) => findKey.getState(state)!

/** Interactive only (Editor.tsx), not part of the schema list. FindBar.tsx drives it through FindMeta. */
export const FindInPage = Extension.create({
  name: 'findInPage',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: (_, { doc }) => build(doc, '', 0),
          apply(tr, prev) {
            const meta = tr.getMeta(findKey) as FindMeta | undefined
            if (meta && 'query' in meta) return build(tr.doc, meta.query, 0)
            if (meta && 'step' in meta) {
              const n = prev.matches.length
              return n ? build(tr.doc, prev.query, (prev.current + meta.step + n) % n) : prev
            }
            // ponytail: re-searches the whole doc on every edit while a query is open; fine at note sizes.
            return tr.docChanged && prev.query ? build(tr.doc, prev.query, prev.current) : prev
          },
        },
        props: { decorations: state => findKey.getState(state)!.decos },
      }),
    ]
  },
})
