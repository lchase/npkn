import type { SuggestionOptions } from '@tiptap/suggestion'

/**
 * The small list popup shared by the `[[` page picker and the `/` menu (`.pl-popup` / `.pl-item`).
 * Arrows move, Enter or Tab picks, Escape hides it until the suggestion ends. With no `empty` text an
 * empty list hides the popup and lets keys through, so Enter still makes a new line.
 */
export function suggestPopup<T>(opts: {
  label: (item: T) => string
  className?: (item: T) => string
  empty?: string
}): SuggestionOptions<T, T>['render'] {
  return () => {
    let el: HTMLDivElement | null = null
    let items: T[] = []
    let index = 0
    let dismissed = false
    let pick: ((item: T) => void) | null = null

    const draw = () => {
      if (!el) return
      el.replaceChildren()
      el.hidden = dismissed || (!items.length && !opts.empty)
      if (!items.length) {
        const none = document.createElement('div')
        none.className = 'pl-empty'
        none.textContent = opts.empty ?? ''
        el.append(none)
        return
      }
      items.forEach((it, i) => {
        const row = document.createElement('div')
        row.className = 'pl-item' + (i === index ? ' on' : '') + (opts.className ? ' ' + opts.className(it) : '')
        row.textContent = opts.label(it)
        // mousedown, not click: a click would blur the editor and end the suggestion first.
        row.addEventListener('mousedown', e => {
          e.preventDefault()
          pick?.(it)
        })
        el!.append(row)
      })
      el.querySelector('.pl-item.on')?.scrollIntoView({ block: 'nearest' })
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
        dismissed = false
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
        if (dismissed || el?.hidden) return false
        if (event.key === 'Escape') {
          dismissed = true
          draw()
          return true
        }
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
  }
}
