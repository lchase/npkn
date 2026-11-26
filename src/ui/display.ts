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

// Focus mode: sidebar and page chrome hidden, title and editor left. Same per-device treatment as width.
const FOCUS_KEY = 'npkn.focus'
let focus = (() => {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1'
  } catch {
    return false
  }
})()

function apply() {
  document.documentElement.dataset.width = width
  if (focus) document.documentElement.dataset.focus = ''
  else delete document.documentElement.dataset.focus
}

export function setFocusMode(next: boolean) {
  focus = next
  try {
    if (next) localStorage.setItem(FOCUS_KEY, '1')
    else localStorage.removeItem(FOCUS_KEY)
  } catch {
    /* preference just won't persist */
  }
  apply()
  listeners.forEach(l => l())
}

export const isFocusMode = () => focus

export function useFocusMode(): boolean {
  return useSyncExternalStore(
    cb => (listeners.add(cb), () => void listeners.delete(cb)),
    () => focus,
  )
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
