import { Extension, InputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import Suggestion from '@tiptap/suggestion'
import { hrefToId, pageHref } from '../core/links'
import { getPageDirectory, matchPages } from './pageDirectory'
import { suggestPopup } from './suggestPopup'

type Item = { kind: 'page'; id: string; title: string } | { kind: 'create'; title: string }

/**
 * Links between pages, in the editor:
 *  - typing `[[` opens a title picker; choosing one inserts a link (or creates the page)
 *  - typing a complete `[[Title]]` for an existing page converts it
 *  - clicking a link follows it (hold Alt to put the caret in the link instead)
 *  - links to pages that no longer exist are marked
 *
 * Links are ordinary link marks with an `npkn:<id>` href (see core/links.ts).
 */
export const PageLinks = Extension.create({
  name: 'pageLinks',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('pageLinkBehaviour'),
        props: {
          handleClick(_view, _pos, event) {
            const a = (event.target as HTMLElement | null)?.closest?.('a')
            if (!a || event.altKey || event.button !== 0) return false
            const href = a.getAttribute('href') ?? ''
            const id = hrefToId(href)
            if (id) {
              getPageDirectory().navigate(id)
              return true
            }
            if (/^https?:\/\//i.test(href)) {
              window.open(href, '_blank', 'noopener,noreferrer')
              return true
            }
            return false
          },
          decorations(state) {
            const known = new Set(getPageDirectory().pages.map(p => p.id))
            const out: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText) return
              for (const m of node.marks) {
                const id = m.type.name === 'link' ? hrefToId(String(m.attrs.href ?? '')) : null
                if (id && !known.has(id)) {
                  out.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'link-broken', title: 'This page no longer exists' }))
                }
              }
            })
            return DecorationSet.create(state.doc, out)
          },
        },
      }),

      Suggestion<Item, Item>({
        editor,
        pluginKey: new PluginKey('pageLinkSuggest'),
        char: '[[',
        allowSpaces: true,
        items: ({ query }) => {
          const { pages } = getPageDirectory()
          const items: Item[] = matchPages(pages, query).map(p => ({ kind: 'page', id: p.id, title: p.title }))
          const q = query.trim()
          if (q && !pages.some(p => p.title.toLowerCase() === q.toLowerCase())) items.push({ kind: 'create', title: q })
          return items
        },
        command: ({ editor, range, props }) => {
          const insert = (id: string, title: string) =>
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: 'text', text: title, marks: [{ type: 'link', attrs: { href: pageHref(id) } }] },
                { type: 'text', text: ' ' },
              ])
              .run()
          if (props.kind === 'create') void getPageDirectory().create(props.title).then(p => insert(p.id, p.title))
          else insert(props.id, props.title)
        },
        render: suggestPopup<Item>({
          label: it => (it.kind === 'create' ? `Create “${it.title}”` : it.title || 'Untitled'),
          className: it => (it.kind === 'create' ? 'create' : ''),
          empty: 'No pages yet',
        }),
      }),
    ]
  },

  addInputRules() {
    return [
      // A complete [[Title]] typed by hand, for a page that exists.
      new InputRule({
        find: /\[\[([^[\]]{1,120})\]\]$/,
        handler: ({ state, range, match }) => {
          const wanted = match[1].trim().toLowerCase()
          const page = getPageDirectory().pages.find(p => p.title.toLowerCase() === wanted)
          if (!page) return null
          const link = state.schema.text(page.title, [state.schema.marks.link.create({ href: pageHref(page.id) })])
          state.tr.replaceWith(range.from, range.to, [link, state.schema.text(' ')])
        },
      }),
    ]
  },
})
