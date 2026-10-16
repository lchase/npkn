import { Extension, InputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import Suggestion from '@tiptap/suggestion'
import { hrefToId, pageHref } from '../core/links'
import { getPageDirectory, matchPages } from './pageDirectory'

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
        render: () => {
          let el: HTMLDivElement | null = null
          let items: Item[] = []
          let index = 0
          let pick: ((item: Item) => void) | null = null

          const draw = () => {
            if (!el) return
            el.replaceChildren()
            if (!items.length) {
              const none = document.createElement('div')
              none.className = 'pl-empty'
              none.textContent = 'No pages yet'
              el.append(none)
              return
            }
            items.forEach((it, i) => {
              const row = document.createElement('div')
              row.className = 'pl-item' + (i === index ? ' on' : '') + (it.kind === 'create' ? ' create' : '')
              row.textContent = it.kind === 'create' ? `Create “${it.title}”` : it.title || 'Untitled'
              // mousedown, not click: a click would blur the editor and end the suggestion first.
              row.addEventListener('mousedown', e => {
                e.preventDefault()
                pick?.(it)
              })
              el!.append(row)
            })
          }

          const place = (rect: DOMRect | null | undefined) => {
            if (!el || !rect) return
            el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 300))}px`
            el.style.top = `${rect.bottom + 6}px`
          }

          return {
            onStart: props => {
              el = document.createElement('div')
              el.className = 'pl-popup'
              document.body.append(el)
              items = props.items
              index = 0
              pick = props.command
              draw()
              place(props.clientRect?.())
            },
            onUpdate: props => {
              items = props.items
              pick = props.command
              index = Math.min(index, Math.max(0, items.length - 1))
              draw()
              place(props.clientRect?.())
            },
            onKeyDown: ({ event }) => {
              if (!items.length) return false
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                index = (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
                draw()
                return true
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                pick?.(items[index])
                return true
              }
              return false
            },
            onExit: () => {
              el?.remove()
              el = null
            },
          }
        },
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
