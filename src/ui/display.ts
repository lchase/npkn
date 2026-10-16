import { useSyncExternalStore } from 'react'

/**
 * Display preferences that belong to the person, not the theme or the notebook: how wide the reading
 * column is. Stored per browser/app and applied as a data attribute on <html> before first paint.
 */
export type PageWidth = 'standard' | 'wide' | 'full'

export const WIDTHS: { id: PageWidth; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'Comfortable line length for prose' },
  { id: 'wide', label: 'Wide', hint: 'Roomier: better for code, tables and long todo lines' },
  { id: 'full', label: 'Full', hint: 'Use the whole window' },
]

const KEY = 'npkn.width'
const listeners = new Set<() => void>()

function read(): PageWidth {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'wide' || v === 'full' ? v : 'standard'
  } catch {
    return 'standard'
  }
}

let width: PageWidth = read()

function apply() {
  document.documentElement.dataset.width = width
}

export function setPageWidth(next: PageWidth) {
  width = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* preference just won't persist */
  }
  apply()
  listeners.forEach(l => l())
}

export function usePageWidth(): PageWidth {
  return useSyncExternalStore(
    cb => (listeners.add(cb), () => void listeners.delete(cb)),
    () => width,
  )
}

export function initDisplay() {
  apply()
}
