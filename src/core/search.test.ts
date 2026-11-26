import { describe, expect, it } from 'vitest'
import { searchPages, type SnippetPart } from './search'
import type { Page } from './types'

const page = (title: string, body = '', frontmatter?: string): Page => ({
  id: title, parentId: null, title, updatedAt: 1, frontmatter,
  content: { type: 'doc', content: [{ type: 'paragraph', content: body ? [{ type: 'text', text: body }] : [] }] },
})
const titles = (pages: Page[], q: string) => searchPages(pages, q).map(r => r.page.title)
const text = (parts: SnippetPart[]) => parts.map(p => p.text).join('')
const hits = (parts: SnippetPart[]) => parts.filter(p => p.hit).map(p => p.text)

describe('searchPages', () => {
  it('ranks title exact > prefix > contains > front matter > body, ties alphabetical', () => {
    const pages = [
      page('Zed notes', 'the budget is tight'),
      page('Alpha notes', 'budget review'),
      page('Meta', '', 'tags: [budget]'),
      page('Old budget'),
      page('Budget plan'),
      page('Budget'),
      page('Budgeting'),
    ]
    expect(titles(pages, 'budget')).toEqual([
      'Budget', 'Budget plan', 'Budgeting', 'Old budget', 'Meta', 'Alpha notes', 'Zed notes',
    ])
  })

  it('requires every word somewhere (AND), case-insensitive', () => {
    const pages = [page('Q3 Plan', 'hiring freeze until March'), page('Q4 Plan', 'hiring continues')]
    expect(titles(pages, 'PLAN freeze')).toEqual(['Q3 Plan'])
    expect(titles(pages, 'plan nothing')).toEqual([])
    expect(titles(pages, '   ')).toEqual([])
  })

  it('highlights every query word in the snippet', () => {
    const [r] = searchPages([page('X', 'Budget cut, budget grew, spend flat.')], 'budget spend')
    expect(hits(r.snippet)).toEqual(['Budget', 'budget', 'spend'])
    expect(text(r.snippet)).toBe('Budget cut, budget grew, spend flat.')
  })

  it('windows ~40 chars around the first body match at word boundaries, with ellipses', () => {
    const before = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet '
    const after = ' kilo lima mike november oscar papa quebec romeo sierra tango'
    const [r] = searchPages([page('X', before + 'TARGET' + after)], 'target')
    const s = text(r.snippet)
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(hits(r.snippet)).toEqual(['TARGET'])
    // No word is cut in half at either edge.
    const inner = s.slice(1, -1)
    for (const w of inner.split(' ')) expect((before + 'TARGET' + after).split(' ')).toContain(w)
    expect(inner.indexOf('TARGET')).toBeLessThanOrEqual(40)
    expect(inner.length - inner.indexOf('TARGET') - 'TARGET'.length).toBeLessThanOrEqual(40)
  })

  it('gives title-only matches an empty snippet and treats regex characters literally', () => {
    expect(searchPages([page('Budget', 'nothing here')], 'budget')[0].snippet).toEqual([])
    expect(hits(searchPages([page('X', 'costs (est.) rose')], '(est.)')[0].snippet)).toEqual(['(est.)'])
  })
})
