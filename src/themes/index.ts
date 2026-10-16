/**
 * Themes are plain data: a JSON file of CSS custom-property values. No code runs.
 *
 *  - Built-in / contributed themes: drop a `*.json` into `src/themes/builtin/`.
 *  - User themes: imported at runtime from the sidebar, stored in localStorage.
 *
 * A theme may be partial. Missing tokens fall back to Paper (light) or Ink (dark),
 * chosen by the theme's `scheme`. See THEMES.md for the token list.
 */

export interface Theme {
  id: string
  name: string
  scheme: 'light' | 'dark'
  author?: string
  vars: Record<string, string>
}

const modules = import.meta.glob<Theme>('./builtin/*.json', { eager: true, import: 'default' })
export const builtinThemes: Theme[] = Object.values(modules).sort((a, b) => a.name.localeCompare(b.name))

const KEY_SELECTED = 'npkn.theme'
const KEY_CUSTOM = 'npkn.customThemes'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch {
    /* storage blocked: theme just won't persist */
  }
}

export function customThemes(): Theme[] {
  return read<Theme[]>(KEY_CUSTOM, [])
}

export function allThemes(): Theme[] {
  return [...builtinThemes, ...customThemes()]
}

export function selectedThemeId(): string {
  try {
    return localStorage.getItem(KEY_SELECTED) ?? 'auto'
  } catch {
    return 'auto'
  }
}

const byId = (id: string) => builtinThemes.find(t => t.id === id)!

let applied: string[] = []

export function applyTheme(selection: string = selectedThemeId()) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme =
    selection === 'auto'
      ? byId(prefersDark ? 'ink' : 'paper')
      : (allThemes().find(t => t.id === selection) ?? byId('paper'))
  const base = byId(theme.scheme === 'dark' ? 'ink' : 'paper')
  const vars = { ...base.vars, ...theme.vars }

  const root = document.documentElement
  for (const k of applied) root.style.removeProperty('--' + k)
  applied = Object.keys(vars)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty('--' + k, v)
  root.dataset.theme = theme.id
  root.dataset.scheme = theme.scheme
  root.style.colorScheme = theme.scheme
}

/** Light/dark counterparts, so a quick toggle stays within a theme family when it has one. */
const PAIRS: Record<string, string> = {
  paper: 'ink',
  ink: 'paper',
  'gruvbox-light': 'gruvbox-dark',
  'gruvbox-dark': 'gruvbox-light',
  nord: 'paper',
}

/** The theme to switch to for a light<->dark flip from `selection` ('auto' resolves via the system). */
export function oppositeThemeId(selection: string = selectedThemeId()): string {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const current = selection === 'auto' ? (prefersDark ? 'ink' : 'paper') : selection
  if (PAIRS[current]) return PAIRS[current]
  const theme = allThemes().find(t => t.id === current)
  return theme?.scheme === 'dark' ? 'paper' : 'ink'
}

export function selectTheme(id: string) {
  write(KEY_SELECTED, id)
  applyTheme(id)
}

export function initTheme() {
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (selectedThemeId() === 'auto') applyTheme('auto')
  })
}

/** Validate and store an imported theme. Throws with a readable message on bad input. */
export function importTheme(json: unknown): Theme {
  const t = json as Partial<Theme>
  if (!t || typeof t !== 'object') throw new Error('Theme must be a JSON object')
  if (typeof t.id !== 'string' || !/^[\w-]+$/.test(t.id)) throw new Error('"id" must be letters, digits, - or _')
  if (typeof t.name !== 'string' || !t.name) throw new Error('"name" is required')
  if (t.scheme !== 'light' && t.scheme !== 'dark') throw new Error('"scheme" must be "light" or "dark"')
  if (!t.vars || typeof t.vars !== 'object') throw new Error('"vars" must be an object')
  for (const [k, v] of Object.entries(t.vars)) {
    if (typeof v !== 'string') throw new Error(`vars.${k} must be a string`)
    // Values are written into style properties only; block url()/expression to keep themes inert data.
    if (/url\s*\(|expression\s*\(|@import/i.test(v)) throw new Error(`vars.${k}: url()/@import not allowed`)
  }
  if (builtinThemes.some(b => b.id === t.id)) throw new Error(`"${t.id}" is a built-in theme id`)
  const theme: Theme = { id: t.id, name: t.name, scheme: t.scheme, author: t.author, vars: t.vars as Record<string, string> }
  write(KEY_CUSTOM, [...customThemes().filter(c => c.id !== theme.id), theme])
  return theme
}
