import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

type Heading = { level: number; text: string; pos: number }

const MIN_HEADINGS = 3
const MIN_ROOM = 200 // px of free space right of the page; below that the outline doesn't render

function headingsOf(editor: Editor): Heading[] {
  const out: Heading[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level)
    if (level <= 3 && node.textContent.trim()) out.push({ level, text: node.textContent.trim(), pos })
    return false
  })
  return out
}

/**
 * Headings of the current page in the free space right of it, for long pages. Renders nothing
 * unless the page has a few headings and the window leaves room, so short notes look unchanged.
 */
export function Outline({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLElement>(null)
  const [headings, setHeadings] = useState(() => headingsOf(editor))
  const [room, setRoom] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const update = () => setHeadings(headingsOf(editor))
    editor.on('update', update)
    return () => {
      editor.off('update', update)
    }
  }, [editor])

  // Room is measured, not set by a media query: it depends on the sidebar, the page-width setting
  // and the window together.
  useEffect(() => {
    const page = ref.current?.closest('.page')
    const main = page?.closest('main')
    if (!page || !main) return
    const measure = () => setRoom(main.getBoundingClientRect().right - page.getBoundingClientRect().right >= MIN_ROOM)
    const ro = new ResizeObserver(measure)
    ro.observe(main)
    ro.observe(page)
    return () => ro.disconnect()
  }, [])

  const shown = room && headings.length >= MIN_HEADINGS
  // Indent relative to the page's top level, so a page that starts at ## isn't all indented.
  const top = Math.min(...headings.map(h => h.level))

  // Current = the last heading scrolled past the top of the view.
  useEffect(() => {
    const main = ref.current?.closest('main')
    if (!shown || !main) return
    const onScroll = () => {
      const top = main.getBoundingClientRect().top + 80
      let at = 0
      headings.forEach((h, i) => {
        const el = editor.view.nodeDOM(h.pos) as HTMLElement | null
        if (el && el.getBoundingClientRect().top <= top) at = i
      })
      setCurrent(at)
    }
    onScroll()
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [shown, headings, editor])

  const go = (h: Heading) => {
    const el = editor.view.nodeDOM(h.pos) as HTMLElement | null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <nav ref={ref} className="outline" aria-label="Outline">
      {shown && (
        <ul>
          {headings.map((h, i) => (
            <li key={h.pos} className={`lvl${h.level - top + 1}` + (i === current ? ' on' : '')}>
              <button onClick={() => go(h)} title={h.text} aria-current={i === current ? 'location' : undefined}>
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
