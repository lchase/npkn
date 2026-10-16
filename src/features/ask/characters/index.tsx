import { useSyncExternalStore } from 'react'
import { Dot, PRESETS, type Look } from './Dot'
import type { CharacterProps } from './types'

export type { Mood, CharacterProps } from './types'
export type { Look } from './Dot'

/** Characters are presets of one `Dot` renderer: a shape, a colour, an eye style, an optional accessory. */
export const CHARACTERS = PRESETS

const KEY = 'npkn.character'
const KEY_LOOK = 'npkn.look'
const KEY_COLORS = 'npkn.characterColors'
const DEFAULT = 'pip'
const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

let current = (() => {
  const id = read(KEY)
  return id && CHARACTERS.some(c => c.id === id) ? id : DEFAULT
})()
let look: Look = (() => {
  const v = read(KEY_LOOK)
  return v === 'flat' || v === 'plush' ? v : 'soft'
})()
const HEX = /^#[0-9a-f]{6}$/i

/** Per-character colour overrides, keyed by preset id. Anything that isn't a #rrggbb is dropped. */
let colors: Record<string, string> = (() => {
  try {
    const raw = JSON.parse(read(KEY_COLORS) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string' && HEX.test(v))) as Record<string, string>
  } catch {
    return {}
  }
})()

// useSyncExternalStore needs a stable snapshot object between changes.
let snapshot = { id: current, look, colors }

function emit() {
  snapshot = { id: current, look, colors }
  listeners.forEach(l => l())
}

export function setCharacter(id: string) {
  current = id
  write(KEY, id)
  emit()
}

export function setLook(next: Look) {
  look = next
  write(KEY_LOOK, next)
  emit()
}

/** Set a character's colour, or pass null to restore its default. */
export function setColor(id: string, hex: string | null) {
  const next = { ...colors }
  if (hex && HEX.test(hex)) next[id] = hex.toLowerCase()
  else delete next[id]
  colors = next
  write(KEY_COLORS, JSON.stringify(next))
  emit()
}

export function useCharacter() {
  return useSyncExternalStore(
    cb => (listeners.add(cb), () => void listeners.delete(cb)),
    () => snapshot,
  )
}

/** The selected character, or an explicit one (used by the gallery). */
export function Avatar({ character, ...props }: CharacterProps & { character?: string }) {
  const sel = useCharacter()
  const preset = CHARACTERS.find(c => c.id === (character ?? sel.id)) ?? CHARACTERS[0]
  // Fuzz filtering is wasted (and muddy) at icon size; fall back to soft.
  const tiny = typeof props.size === 'number' && props.size < 48
  const look = sel.look === 'plush' && tiny ? 'soft' : sel.look
  return <Dot preset={{ ...preset, color: sel.colors[preset.id] ?? preset.color }} look={look} {...props} />
}
