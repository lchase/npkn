import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import { parseDate, relativeLabel, isOverdue } from '../core/dates'

export function hueFor(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/**
 * Inline chip. Typing `@word ` converts to a date chip if word parses as a date,
 * otherwise a category chip. Hyphens allowed: `@client-acme-q4 `.
 */
export const Chip = Node.create({
  name: 'chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      kind: { default: 'category' }, // 'category' | 'date'
      value: { default: '' },
      iso: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-chip]' }]
  },

  renderHTML({ node }) {
    const { kind, value, iso } = node.attrs
    const attrs: Record<string, string> = { 'data-chip': '', 'data-kind': kind }
    let label = value as string
    let cls = `chip chip-${kind}`
    if (kind === 'date' && iso) {
      label = relativeLabel(iso)
      if (isOverdue(iso)) cls += ' overdue'
    } else {
      attrs.style = `--h:${hueFor(value)}`
      // The label registry colors chips through this attribute (see core/labels labelCss).
      attrs['data-label'] = String(value).toLowerCase()
    }
    return ['span', mergeAttributes(attrs, { class: cls }), label]
  },

  // This is also the text the input rules see before the cursor. The trailing space matters: without it
  // a chip directly followed by a new `@doing ` reads as one glued word and never converts.
  renderText({ node }) {
    return '@' + node.attrs.value + ' '
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)@([\w-]+) $/,
        handler: ({ state, range, match }) => {
          const word = match[1]
          const iso = parseDate(word)
          const chip = this.type.create({
            kind: iso ? 'date' : 'category',
            value: word,
            iso,
          })
          // Keep the leading whitespace the regex swallowed.
          const from = match[0].startsWith('@') ? range.from : range.from + 1
          state.tr.replaceWith(from, range.to, [chip, state.schema.text(' ')])
        },
      }),
    ]
  },
})
