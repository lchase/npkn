import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { matchLabels, type LabelOption } from '../core/labels'
import { hueFor } from './chip'
import { getPageDirectory } from './pageDirectory'

/**
 * Typing `@` offers the labels that already exist (statuses like doing/done first), filtered as you
 * type. Enter or Tab inserts the chip; a space still converts whatever you typed, so a brand-new label
 * or a date word (`@fri `) works exactly as before. Interactive only, like PageLinks.
 */
export const ChipSuggest = Extension.create({
  name: 'chipSuggest',

  addProseMirrorPlugins() {
    return [
      Suggestion<LabelOption, LabelOption>({
        editor: this.editor,
        pluginKey: new PluginKey('chipSuggest'),
        char: '@',
        items: ({ query }) => matchLabels(getPageDirectory().labels, query),
        command: ({ editor, range, props }) =>
          editor
            .chain()
            .focus()
            .insertContentAt(range, [{ type: 'chip', attrs: { kind: 'category', value: props.name } }, { type: 'text', text: ' ' }])
            .run(),
        render: () => {
          let el: HTMLDivElement | null = null
          let items: LabelOption[] = []
          let index = 0
          let pick: ((item: LabelOption) => void) | null = null

          const draw = () => {
            if (!el) return
            el.replaceChildren()
            el.style.display = items.length ? '' : 'none'
            items.forEach((it, i) => {
              const row = document.createElement('div')
              row.className = 'pl-item chip-opt' + (i === index ? ' on' : '')
              // Same markup as the real chip (chip.ts renderHTML) so the label registry colors it.
              const chip = document.createElement('span')
              chip.className = 'chip chip-category'
              chip.dataset.label = it.name
              chip.style.setProperty('--h', String(hueFor(it.name)))
              chip.textContent = it.name
              const note = document.createElement('span')
              note.className = 'chip-opt-note'
              note.textContent = it.status ? 'status' : it.count ? `${it.count} use${it.count === 1 ? '' : 's'}` : ''
              row.append(chip, note)
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
})
