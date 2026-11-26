import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import { parsePrUrl, prKey, type PrBadge, type PrRef } from '../core/pullRequests'

/**
 * A badge after every GitHub pull request link showing its state. Render-only: a widget decoration, so
 * it never reaches the document, the .md file, exports or updatedAt.
 *
 * The states come from an injected source (App wires it to features/github/status), the same way
 * pageDirectory.ts works: editor extensions are created outside React and must not import features.
 */
export interface PrBadgeSource {
  /** null = the feature is off: draw nothing. */
  get(key: string): PrBadge | null
  style(): 'pill' | 'title'
  subscribe(cb: () => void): () => void
  /** These PRs are on the open page; returns the undo. */
  watch(keys: string[]): () => void
}

let source: PrBadgeSource = { get: () => null, style: () => 'pill', subscribe: () => () => {}, watch: () => () => {} }
export const setPrBadgeSource = (next: PrBadgeSource) => {
  source = next
}

interface Range {
  to: number
  href: string
  ref: PrRef
}

/** PR links in the doc, adjacent text nodes with the same link merged into one range. */
function prLinks(doc: PmNode): Range[] {
  const out: (Range & { from: number })[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const href = String(node.marks.find(m => m.type.name === 'link')?.attrs.href ?? '')
    const ref = href ? parsePrUrl(href) : null
    if (!ref) return
    const last = out[out.length - 1]
    if (last && last.href === href && last.to === pos) last.to = pos + node.nodeSize
    else out.push({ from: pos, to: pos + node.nodeSize, href, ref })
  })
  return out
}

const LABEL = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' }

const hhmm = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** State class (`prb-<state>`), faded when rate limited, visible word, and hover text. */
function describe(b: PrBadge, ref: PrRef) {
  const name = `${ref.owner}/${ref.repo}#${ref.number}`
  const last = b.checkedAt ? `last checked ${hhmm(b.checkedAt)}` : 'not checked yet'
  if (b.problem === 'rejected') return { cls: 'rejected', word: 'Token rejected', hover: `${name}\nGitHub rejected the token. Check it in Settings > GitHub.` }
  if (b.problem === 'noaccess') return { cls: 'noaccess', word: 'No access', hover: `${name}\nPrivate or missing. Add a GitHub token in Settings.` }
  if (b.problem === 'ratelimited') {
    const word = b.state ? LABEL[b.state] : 'Rate limited'
    return { cls: `${b.state ?? 'checking'} prb-ratelimited`, word, hover: `${name}${b.state ? ` · ${word}` : ''}\nRate limited, ${last}` }
  }
  if (!b.state) return { cls: 'checking', word: 'Checking…', hover: `${name}\nChecking GitHub…` }
  return { cls: b.state, word: LABEL[b.state], hover: `${name} · ${LABEL[b.state]}\n${last[0].toUpperCase()}${last.slice(1)}` }
}

function badge(b: PrBadge, r: Range, style: 'pill' | 'title') {
  const d = describe(b, r.ref)
  const el = document.createElement('span')
  el.contentEditable = 'false'
  el.className = `prb prb-${style} prb-${d.cls}`
  el.title = d.hover
  // mousedown, not click: the caret must not land in the link, and ProseMirror never sees the press.
  el.addEventListener('mousedown', e => {
    e.preventDefault()
    if (e.button === 0) window.open(r.href, '_blank', 'noopener,noreferrer')
  })
  if (style === 'pill') {
    el.textContent = d.word
  } else {
    const word = document.createElement('b')
    word.textContent = d.word.toLowerCase()
    // textContent only: the title is whatever the PR author typed.
    el.append(' ', document.createElement('i'), ' ', b.state && b.title && (!b.problem || b.problem === 'ratelimited') ? `${b.title} · ` : '', word)
  }
  return el
}

const key = new PluginKey('prBadges')

export const PrBadges = Extension.create({
  name: 'prBadges',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const style = source.style()
            const out: Decoration[] = []
            for (const r of prLinks(state.doc)) {
              const b = source.get(prKey(r.ref))
              if (!b) continue
              out.push(
                Decoration.widget(r.to, () => badge(b, r, style), {
                  side: 1,
                  ignoreSelection: true,
                  // Same key = same DOM, so an unchanged badge isn't rebuilt on every keystroke.
                  key: `${r.href}|${style}|${b.state}|${b.problem}|${b.checkedAt}|${b.title}`,
                }),
              )
            }
            return DecorationSet.create(state.doc, out)
          },
        },
        view(view) {
          let keys = ''
          let unwatch = () => {}
          const sync = () => {
            const next = [...new Set(prLinks(view.state.doc).map(r => prKey(r.ref)))].sort()
            if (next.join() === keys) return
            keys = next.join()
            // Watch the new set before dropping the old, so PRs on both never look newly opened.
            const undo = source.watch(next)
            unwatch()
            unwatch = undo
          }
          sync()
          const unsubscribe = source.subscribe(() => {
            // A no-op transaction redraws decorations; it changes no content, so nothing is saved.
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true).setMeta('addToHistory', false))
          })
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc)) sync()
            },
            destroy() {
              unsubscribe()
              unwatch()
            },
          }
        },
      }),
    ]
  },
})
