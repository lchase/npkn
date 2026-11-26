import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { matchLabels, type LabelOption } from '../core/labels'
import { hueFor } from './chip'
import { getPageDirectory } from './pageDirectory'
import { suggestPopup } from './suggestPopup'

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
        render: suggestPopup<LabelOption>({
          label: it => it.name,
          className: () => 'chip-opt',
          // Same markup as the real chip (chip.ts renderHTML) so the label registry colors it.
          content: it => {
            const chip = document.createElement('span')
            chip.className = 'chip chip-category'
            chip.dataset.label = it.name
            chip.style.setProperty('--h', String(hueFor(it.name)))
            chip.textContent = it.name
            const note = document.createElement('span')
            note.className = 'chip-opt-note'
            note.textContent = it.status ? 'status' : it.count ? `${it.count} use${it.count === 1 ? '' : 's'}` : ''
            return [chip, note]
          },
        }),
      }),
    ]
  },
})
