import { stringify } from 'yaml'
import { parseFront } from './frontmatter'
import type { Doc, Page } from './types'

/**
 * Labels are the `@word` chips. Most are plain categories ("work", "client-acme"). A label can also be a
 * STATUS: it belongs to one of three groups that say what it means for a todo:
 *
 *   todo    not started          (todo)
 *   active  started, unfinished  (doing, blocked, in-review)
 *   done    finished             (done)
 *
 * The group, not the name, drives behaviour, so "in-review" and "blocked" are just active statuses and
 * anyone can define their own. Colors are optional overrides; without one a label keeps its generated color.
 */

export type Group = 'todo' | 'active' | 'done'
export interface LabelDef {
  color?: string
  kind?: 'status' | 'category'
  group?: Group
}
export type Registry = Record<string, LabelDef>

export const GROUPS: Group[] = ['todo', 'active', 'done']
export const GROUP_LABEL: Record<Group, string> = { todo: 'To do', active: 'In progress', done: 'Done' }

/** Built in so statuses work before anyone configures anything. Overridable, never required. */
export const DEFAULT_STATUSES: Registry = {
  todo: { kind: 'status', group: 'todo', color: '#8a8780' },
  doing: { kind: 'status', group: 'active', color: '#2f6fed' },
  blocked: { kind: 'status', group: 'active', color: '#d9472b' },
  'in-review': { kind: 'status', group: 'active', color: '#8f5cff' },
  done: { kind: 'status', group: 'done', color: '#2f9e5a' },
}

export const LABELS_PAGE_ID = 'labels'
const HEX = /^#[0-9a-f]{6}$/i
const NAME = /^[\w-]+$/

/** Label names are matched case-insensitively. */
export const norm = (s: string) => s.toLowerCase()

/** The user's overrides, read from the `labels:` key of a page's front matter. Bad entries are dropped. */
export function parseRegistry(frontmatter: string | undefined): Registry {
  const p = parseFront(frontmatter)
  const raw = p?.ok ? p.data.labels : undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Registry = {}
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!NAME.test(name) || !v || typeof v !== 'object') continue
    const d = v as Record<string, unknown>
    const def: LabelDef = {}
    if (typeof d.color === 'string' && HEX.test(d.color)) def.color = d.color.toLowerCase()
    if (d.kind === 'status' || d.kind === 'category') def.kind = d.kind
    if (typeof d.group === 'string' && (GROUPS as string[]).includes(d.group)) def.group = d.group as Group
    out[norm(name)] = def
  }
  return out
}

/** Defaults with the user's overrides laid over them, field by field. */
export function effectiveRegistry(user: Registry = {}): Registry {
  const out: Registry = {}
  for (const k of Object.keys(DEFAULT_STATUSES)) out[k] = { ...DEFAULT_STATUSES[k] }
  for (const [k, v] of Object.entries(user)) out[k] = { ...out[k], ...v }
  return out
}

/** The registry for a set of pages: the "Labels" page's front matter over the defaults. */
export function registryFromPages(pages: Pick<Page, 'id' | 'frontmatter'>[]): Registry {
  const page = pages.find(p => p.id === LABELS_PAGE_ID)
  return effectiveRegistry(parseRegistry(page?.frontmatter))
}

export const isStatus = (reg: Registry, label: string) => {
  const d = reg[norm(label)]
  return d?.kind === 'status' && !!d.group
}

const RANK: Record<Group, number> = { todo: 0, active: 1, done: 2 }

/** The status a todo is in, given its labels. If several, the furthest along wins. */
export function statusOf(reg: Registry, labels: string[]): { label: string; group: Group } | null {
  let best: { label: string; group: Group } | null = null
  for (const l of labels) {
    const d = reg[norm(l)]
    if (d?.kind === 'status' && d.group && (!best || RANK[d.group] > RANK[best.group])) best = { label: l, group: d.group }
  }
  return best
}

/** Statuses in display order: by group, then by the order they were defined. */
export function statusList(reg: Registry): { label: string; group: Group; color?: string }[] {
  return Object.entries(reg)
    .filter(([, d]) => d.kind === 'status' && d.group)
    .map(([label, d]) => ({ label, group: d.group as Group, color: d.color }))
    .sort((a, b) => RANK[a.group] - RANK[b.group])
}

/** Every distinct label used by a chip anywhere in the pages (dates excluded). */
export function collectLabels(pages: Pick<Page, 'content'>[]): Map<string, number> {
  const counts = new Map<string, number>()
  const walk = (n: Doc) => {
    if (n.type === 'chip' && n.attrs?.kind !== 'date' && typeof n.attrs?.value === 'string') {
      const k = norm(n.attrs.value)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    n.content?.forEach(walk)
  }
  for (const p of pages) if (p.content) walk(p.content)
  return counts
}

/**
 * CSS that colors chips from the registry. Selectors and values are built only from validated names and
 * hex colors, so a hand-edited front matter can't inject anything. Updating this stylesheet recolors
 * every chip on screen at once, with no re-render of the editor.
 */
export function labelCss(reg: Registry): string {
  const rules: string[] = []
  for (const [name, d] of Object.entries(reg)) {
    if (!NAME.test(name)) continue
    // Colors apply to anything carrying the label (chips, and the filter buttons in Todos).
    const any = `[data-label="${name}"]`
    const sel = `.chip${any}`
    if (d.color && HEX.test(d.color)) {
      rules.push(`${any}{--chip-bg:color-mix(in srgb,${d.color} 22%,transparent);--chip-fg:color-mix(in oklab,${d.color} 72%,var(--text))}`)
    }
    if (d.kind === 'status') {
      rules.push(`${sel}{font-weight:600}${sel}::before{content:"\\25CF";font-size:0.8em;opacity:0.9;margin-right:4px}`)
      if (d.group === 'done') {
        // A todo carrying a done status reads as finished in the editor too, not only in the Todos view.
        rules.push(`li[data-type="taskItem"]:has(${sel})>div{color:var(--muted);text-decoration:line-through}`)
      }
    }
  }
  return rules.join('\n')
}

/** The `labels:` block to store: only what differs from the built-in defaults. */
export function overridesOf(reg: Registry): Registry {
  const out: Registry = {}
  for (const [k, v] of Object.entries(reg)) {
    const base = DEFAULT_STATUSES[k] ?? {}
    const diff: LabelDef = {}
    if (v.color && v.color !== base.color) diff.color = v.color
    if (v.kind && v.kind !== base.kind) diff.kind = v.kind
    if (v.group && v.group !== base.group) diff.group = v.group
    // A brand-new status needs its full definition, even if every field "matches" nothing.
    if (Object.keys(diff).length || (!DEFAULT_STATUSES[k] && Object.keys(v).length)) out[k] = DEFAULT_STATUSES[k] ? diff : { ...v }
  }
  return out
}

/** Render the `labels:` block as YAML text (just that key). */
export function labelsYaml(overrides: Registry): string {
  return stringify({ labels: overrides }).trimEnd()
}
