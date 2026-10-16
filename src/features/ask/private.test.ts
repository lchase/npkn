import { describe, expect, it } from 'vitest'
import { isFlaggedPrivate, privateIds } from '../../core/frontmatter'
import type { Doc, Page } from '../../core/types'
import { isLoopback } from './config'
import { buildContext } from './retrieve'

const t = (text: string): Doc => ({ type: 'text', text })
const p = (...c: Doc[]): Doc => ({ type: 'paragraph', content: c })
const chip = (value: string): Doc => ({ type: 'chip', attrs: { kind: 'category', value, iso: null } })
const todo = (text: string, tag?: string): Doc => ({
  type: 'taskList',
  content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(t(text + ' '), ...(tag ? [chip(tag)] : []))] }],
})
const doc = (...c: Doc[]): Doc => ({ type: 'doc', content: c })

const page = (id: string, title: string, body: Doc[], over: Partial<Page> = {}): Page => ({
  id, parentId: null, title, content: doc(...body), createdAt: 1, updatedAt: 1, ...over,
})

describe('isFlaggedPrivate', () => {
  it.each([
    ['private: true', true],
    ['type: note\nprivate: true\n', true],
    ['private: "true"', true],
    ['private: TRUE', true], // YAML 1.2 core schema: TRUE is a boolean
    ['private: false', false],
    ['private: yes', false],
    ['type: note', false],
    [undefined, false],
    ['::: not yaml :::', false],
  ])('%j -> %s', (fm, expected) => {
    expect(isFlaggedPrivate(fm as string | undefined)).toBe(expected)
  })
})

describe('privateIds', () => {
  const pages: Page[] = [
    page('a', 'Interviews', [], { frontmatter: 'private: true' }),
    page('b', 'Candidate Jo', [], { parentId: 'a' }),
    page('c', 'Jo round 2', [], { parentId: 'b' }),
    page('d', 'Public notes', []),
    page('e', 'Public child', [], { parentId: 'd' }),
  ]
  it('covers the flagged page and every descendant, and nothing else', () => {
    expect([...privateIds(pages)].sort()).toEqual(['a', 'b', 'c'])
  })
  it('survives a cycle', () => {
    const cyc = [page('x', 'X', [], { parentId: 'y' }), page('y', 'Y', [], { parentId: 'x', frontmatter: 'private: true' })]
    expect([...privateIds(cyc)].sort()).toEqual(['x', 'y'])
  })
})

describe('buildContext and private pages', () => {
  const pages: Page[] = [
    page('a', 'Interviews', [p(t('Hiring pipeline notes.'))], { frontmatter: 'private: true\ntype: index' }),
    page('b', 'Candidate Jo Hartley', [p(t('Jo asked for 240k and has an offer from Zephyr.')), todo('Call Jo references', 'hiring')], {
      parentId: 'a',
      frontmatter: 'type: note\ndescription: Jo Hartley candidate notes\ntags: [candidate]',
    }),
    page('d', 'Sprint plan', [p(t('Ship the sync engine by Friday.')), todo('Write release notes', 'work')]),
  ]
  const q = 'What did Jo ask for and what is in the sprint plan?'

  it('excludes private pages, their sub-pages, titles, metadata and todos by default', () => {
    const { system, sources, excludedPrivate } = buildContext(pages, q)
    for (const secret of ['240k', 'Zephyr', 'Jo Hartley', 'Candidate Jo', 'Call Jo references', 'Hiring pipeline', 'candidate', 'Interviews']) {
      expect(system, `leaked: ${secret}`).not.toContain(secret)
    }
    expect(system).toContain('Ship the sync engine')
    expect(system).toContain('Write release notes')
    expect(sources.map(s => s.title)).toEqual(['Sprint plan'])
    expect(excludedPrivate).toBe(2)
  })

  it('includes them when explicitly allowed (a model on this machine)', () => {
    const { system, excludedPrivate } = buildContext(pages, q, { includePrivate: true })
    expect(system).toContain('240k')
    expect(system).toContain('Call Jo references')
    expect(excludedPrivate).toBe(0)
  })

  it('still excludes in retrieval mode (large notebook), not just full-context mode', () => {
    const filler: Page[] = Array.from({ length: 40 }, (_, i) =>
      page(`f${i}`, `Filler ${i}`, [p(t(`Filler paragraph number ${i}. ` + 'lorem ipsum dolor sit amet '.repeat(20)))]),
    )
    const { system, mode } = buildContext([...pages, ...filler], 'Jo salary offer Zephyr 240k')
    expect(mode).toBe('retrieved')
    expect(system).not.toContain('240k')
    expect(system).not.toContain('Zephyr')
  })

  it('is safe by default: a caller that passes nothing gets the private-free context', () => {
    expect(buildContext(pages, q).system).not.toContain('240k')
  })
})

describe('isLoopback', () => {
  it.each([
    ['http://localhost:11434', true],
    ['http://127.0.0.1:1234/v1', true],
    ['http://[::1]:8080', true],
    ['http://app.localhost:3000', true],
    ['https://api.openai.com/v1', false],
    ['http://192.168.1.20:11434', false], // another machine on the LAN is not "this machine"
    ['http://my-gpu-box:11434', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => expect(isLoopback(url)).toBe(expected))
})

describe('open todos in the prompt', () => {
  const day = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const dated = (text: string, iso: string): Doc => ({
    type: 'taskList',
    content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(t(text + ' '), { type: 'chip', attrs: { kind: 'date', value: 'x', iso } })] }],
  })

  const pages: Page[] = [
    page('a', 'Todos', [dated('Future task', day(5)), dated('Old task', day(-3)), dated('Today task', day(0)), dated('Older task', day(-9)), todo('Undated task')]),
  ]

  it('groups by overdue / today / upcoming / none, each sorted by date', () => {
    const { system } = buildContext(pages, 'what is overdue')
    const section = system.split('## Open todos')[1]
    const at = (s: string) => section.indexOf(s)
    expect(at('### Overdue')).toBeGreaterThan(-1)
    expect(at('### Overdue')).toBeLessThan(at('### Due today'))
    expect(at('### Due today')).toBeLessThan(at('### Upcoming'))
    expect(at('### Upcoming')).toBeLessThan(at('### No due date'))
    // oldest overdue first
    expect(at('Older task')).toBeLessThan(at('Old task'))
    // and each item sits under its own heading
    expect(at('Old task')).toBeLessThan(at('### Due today'))
    expect(at('Future task')).toBeGreaterThan(at('### Upcoming'))
    expect(at('Undated task')).toBeGreaterThan(at('### No due date'))
  })

  it('omits empty groups', () => {
    const { system } = buildContext([page('a', 'T', [todo('only undated')])], 'x')
    expect(system).toContain('### No due date')
    expect(system).not.toContain('### Overdue')
  })
})
