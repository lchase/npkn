import { describe, expect, it } from 'vitest'
import { parseFront } from './frontmatter'
import { DEFAULT_STATUSES, collectLabels, effectiveRegistry, labelCss, labelsYaml, overridesOf, parseRegistry, statusList, statusOf } from './labels'
import { setYamlBlock } from './notefile'
import type { Doc } from './types'

describe('parseRegistry', () => {
  it('reads valid entries and lowercases names', () => {
    const r = parseRegistry('labels:\n  Doing:\n    color: "#2F6FED"\n    kind: status\n    group: active\n')
    expect(r).toEqual({ doing: { color: '#2f6fed', kind: 'status', group: 'active' } })
  })
  it('drops bad colors, kinds, groups and names', () => {
    const r = parseRegistry('labels:\n  ok:\n    color: red\n    kind: wizard\n    group: later\n  "bad name": {color: "#112233"}\n  x: 5\n')
    expect(r).toEqual({ ok: {} })
  })
  it('tolerates missing, invalid and non-mapping input', () => {
    expect(parseRegistry(undefined)).toEqual({})
    expect(parseRegistry('::: nope')).toEqual({})
    expect(parseRegistry('labels: [a, b]')).toEqual({})
  })
})

describe('effectiveRegistry', () => {
  it('ships your five statuses grouped into three buckets', () => {
    const r = effectiveRegistry()
    expect(r.todo.group).toBe('todo')
    expect(['doing', 'blocked', 'in-review'].map(k => r[k].group)).toEqual(['active', 'active', 'active'])
    expect(r.done.group).toBe('done')
  })
  it('lets the user override a field without losing the rest', () => {
    const r = effectiveRegistry({ blocked: { color: '#000000' } })
    expect(r.blocked).toEqual({ kind: 'status', group: 'active', color: '#000000' })
  })
  it('can demote a built-in status to a plain category', () => {
    expect(effectiveRegistry({ todo: { kind: 'category' } }).todo.kind).toBe('category')
  })
})

describe('statusOf / statusList', () => {
  const reg = effectiveRegistry({ waiting: { kind: 'status', group: 'active', color: '#aa8800' } })
  it('finds a status among ordinary labels', () => {
    expect(statusOf(reg, ['work', 'Blocked'])).toEqual({ label: 'Blocked', group: 'active' })
  })
  it('returns null when there is none', () => {
    expect(statusOf(reg, ['work', 'q4'])).toBeNull()
  })
  it('the furthest-along group wins', () => {
    expect(statusOf(reg, ['todo', 'doing', 'done'])?.group).toBe('done')
    expect(statusOf(reg, ['todo', 'doing'])?.group).toBe('active')
  })
  it('lists statuses grouped in order', () => {
    expect(statusList(reg).map(s => s.group)).toEqual(['todo', 'active', 'active', 'active', 'active', 'done'])
  })
})

describe('labelCss', () => {
  it('colors a labelled chip and marks statuses', () => {
    const css = labelCss(effectiveRegistry())
    expect(css).toContain('[data-label="doing"]{--chip-bg:')
    expect(css).toContain('#2f6fed')
    expect(css).toMatch(/\.chip\[data-label="doing"\]::before\{content:"\\25CF"/)
  })
  it('strikes tasks carrying a done status', () => {
    expect(labelCss(effectiveRegistry())).toContain('li[data-type="taskItem"]:has(.chip[data-label="done"])')
  })
  it('cannot be used to inject CSS through names or colors', () => {
    const css = labelCss({
      'x"]{background:url(//evil)}': { color: '#112233' },
      ok: { color: 'red;background:url(//evil)' },
      'a b': { color: '#123456' },
    })
    expect(css).not.toContain('evil')
    expect(css).toBe('')
  })
})

describe('overridesOf', () => {
  it('stores only differences from the defaults, plus full custom statuses', () => {
    const reg = effectiveRegistry({ blocked: { color: '#111111' }, waiting: { kind: 'status', group: 'active', color: '#aa8800' } })
    expect(overridesOf(reg)).toEqual({ blocked: { color: '#111111' }, waiting: { kind: 'status', group: 'active', color: '#aa8800' } })
    expect(overridesOf(effectiveRegistry())).toEqual({})
  })
  it('round-trips through YAML', () => {
    const o = { waiting: { kind: 'status' as const, group: 'active' as const, color: '#aa8800' } }
    expect(parseRegistry(labelsYaml(o))).toEqual(o)
  })
})

describe('collectLabels', () => {
  const chip = (value: string, kind = 'category'): Doc => ({ type: 'chip', attrs: { kind, value, iso: null } })
  it('counts category chips case-insensitively and skips dates', () => {
    const content: Doc = { type: 'doc', content: [{ type: 'paragraph', content: [chip('Work'), chip('work'), chip('x', 'date'), chip('home')] }] }
    expect(Object.fromEntries(collectLabels([{ content }]))).toEqual({ work: 2, home: 1 })
  })
})

describe('setYamlBlock', () => {
  const block = { waiting: { kind: 'status', group: 'active' } }
  it('appends when absent', () => {
    const out = setYamlBlock('type: config\n', 'labels', block)
    expect(parseFront(out)).toMatchObject({ ok: true, data: { type: 'config', labels: block } })
  })
  it('replaces an existing block and leaves neighbours and comments alone', () => {
    const src = '# keep me\ntype: config\nlabels:\n  old:\n    color: "#000000"\n\ntags: [a]\n'
    const out = setYamlBlock(src, 'labels', block)
    expect(out).toContain('# keep me')
    expect(out).toContain('tags: [a]')
    expect(out).not.toContain('old')
    const p = parseFront(out)
    expect(p).toMatchObject({ ok: true, data: { type: 'config', tags: ['a'], labels: block } })
  })
  it('handles an empty overrides object', () => {
    const out = setYamlBlock('labels:\n  a: {}\n', 'labels', {})
    expect(parseFront(out)).toMatchObject({ ok: true, data: { labels: {} } })
  })
  it('does not mistake a key that merely starts the same', () => {
    const out = setYamlBlock('labels_extra: 1\n', 'labels', block)
    expect(out).toContain('labels_extra: 1')
    expect(parseFront(out)).toMatchObject({ data: { labels_extra: 1, labels: block } })
  })
})

describe('DEFAULT_STATUSES', () => {
  it('only uses valid hex colors', () => {
    for (const d of Object.values(DEFAULT_STATUSES)) expect(d.color).toMatch(/^#[0-9a-f]{6}$/)
  })
})
