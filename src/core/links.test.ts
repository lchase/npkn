import { describe, expect, it } from 'vitest'
import {
  backlinks, fileLinkMapper, hasRelativeLinks, hrefToId, linkTargets, mapLinks, pageHref, relativePath,
  resolveRelative, resolveRelativeLinks,
} from './links'
import type { Doc, Page } from './types'

const link = (text: string, href: string): Doc => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
const para = (...c: Doc[]): Doc => ({ type: 'paragraph', content: c })
const doc = (...c: Doc[]): Doc => ({ type: 'doc', content: c })
const page = (id: string, title: string, content: Doc | null): Page => ({ id, parentId: null, title, content, createdAt: 1, updatedAt: 1 })

describe('hrefToId / pageHref', () => {
  it('round-trips and rejects other schemes', () => {
    expect(hrefToId(pageHref('abc-1'))).toBe('abc-1')
    expect(hrefToId('https://x.com')).toBeNull()
    expect(hrefToId('npkn:')).toBeNull()
    expect(hrefToId(undefined)).toBeNull()
  })
})

describe('relativePath', () => {
  it.each([
    ['a.md', 'b.md', 'b.md'],
    ['a.md', 'dir/b.md', 'dir/b.md'],
    ['dir/a.md', 'b.md', '../b.md'],
    ['dir/a.md', 'dir/b.md', 'b.md'],
    ['x/y/a.md', 'x/z/b.md', '../z/b.md'],
    ['x/y/a.md', 'q.md', '../../q.md'],
    ['projects.md', 'projects/plan.md', 'projects/plan.md'],
    ['projects/plan.md', 'projects.md', '../projects.md'],
  ])('%s -> %s = %s', (from, to, expected) => expect(relativePath(from, to)).toBe(expected))
})

describe('resolveRelative', () => {
  it('resolves against the linking file', () => {
    expect(resolveRelative('a/b.md', '../c.md')).toBe('c.md')
    expect(resolveRelative('a/b.md', 'd.md')).toBe('a/d.md')
    expect(resolveRelative('a.md', './x/y.md')).toBe('x/y.md')
    expect(resolveRelative('a/b.md', 'c/d/../e.md')).toBe('a/c/e.md')
  })
  it('handles encoding, fragments and queries', () => {
    expect(resolveRelative('a.md', 'my%20page.md#section')).toBe('my page.md')
    expect(resolveRelative('a.md', 'p.md?x=1')).toBe('p.md')
  })
  it.each(['https://x.com/a.md', 'mailto:a@b.c', '#top', '/abs/a.md', 'image.png', '', 'npkn:abc', '../../../escape.md'])(
    'is not an internal link: %j',
    h => expect(resolveRelative('a.md', h)).toBeNull(),
  )
})

describe('mapLinks', () => {
  it('rewrites hrefs without touching other marks', () => {
    const d = doc(para({ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'a.md' } }] }))
    const out = mapLinks(d, () => 'b.md')
    expect(out.content![0].content![0].marks).toEqual([{ type: 'bold' }, { type: 'link', attrs: { href: 'b.md' } }])
  })
  it('removes the link but keeps the text when the mapper returns null', () => {
    const d = doc(para(link('hello', 'a.md')))
    const out = mapLinks(d, () => null)
    expect(out.content![0].content![0]).toEqual({ type: 'text', text: 'hello' })
  })
  it('does not mutate its input', () => {
    const d = doc(para(link('t', 'a.md')))
    const snapshot = JSON.stringify(d)
    mapLinks(d, () => 'z.md')
    expect(JSON.stringify(d)).toBe(snapshot)
  })
})

describe('linkTargets / backlinks', () => {
  const a = page('a', 'A', doc(para(link('to b', pageHref('b')), link('to c', pageHref('c')), link('web', 'https://x.com'))))
  const b = page('b', 'B', doc(para(link('to c', pageHref('c')))))
  const c = page('c', 'C', doc(para({ type: 'text', text: 'no links' })))
  it('finds internal targets only', () => {
    expect([...linkTargets(a.content)].sort()).toEqual(['b', 'c'])
    expect(linkTargets(null).size).toBe(0)
  })
  it('lists backlinks, excluding self', () => {
    expect(backlinks([a, b, c], 'c').map(p => p.id).sort()).toEqual(['a', 'b'])
    expect(backlinks([a, b, c], 'a')).toEqual([])
    const selfLinked = page('s', 'S', doc(para(link('me', pageHref('s')))))
    expect(backlinks([selfLinked], 's')).toEqual([])
  })
})

describe('resolveRelativeLinks', () => {
  const ids = new Map([['projects/plan.md', 'plan'], ['index.md', 'idx'], ['Notes.md', 'notes']])
  it('resolves what it can and leaves the rest exactly as written', () => {
    const d = doc(para(link('plan', 'projects/plan.md'), link('missing', 'nope.md'), link('web', 'https://a.b')))
    const { doc: out, changed } = resolveRelativeLinks(d, 'start.md', ids)
    const hrefs = out.content![0].content!.map(n => n.marks![0].attrs!.href)
    expect(hrefs).toEqual(['npkn:plan', 'nope.md', 'https://a.b'])
    expect(changed).toBe(true)
  })
  it('is relative to the linking file', () => {
    const d = doc(para(link('up', '../index.md')))
    expect(resolveRelativeLinks(d, 'projects/plan.md', ids).doc.content![0].content![0].marks![0].attrs!.href).toBe('npkn:idx')
  })
  it('matches case-insensitively (macOS volumes)', () => {
    const d = doc(para(link('n', 'notes.md')))
    expect(resolveRelativeLinks(d, 'x.md', ids).doc.content![0].content![0].marks![0].attrs!.href).toBe('npkn:notes')
  })
  it('reports unchanged when nothing resolved', () => {
    expect(resolveRelativeLinks(doc(para(link('x', 'zzz.md'))), 'a.md', ids).changed).toBe(false)
  })
  it('detects unresolved relative links', () => {
    expect(hasRelativeLinks(doc(para(link('x', 'zzz.md'))), 'a.md')).toBe(true)
    expect(hasRelativeLinks(doc(para(link('x', pageHref('q')))), 'a.md')).toBe(false)
    expect(hasRelativeLinks(null, 'a.md')).toBe(false)
  })
})

describe('fileLinkMapper', () => {
  const paths = new Map([['plan', 'projects/plan.md'], ['home', 'home.md'], ['sp', 'my notes/a b.md']])
  const map = (self: string) => fileLinkMapper(self, id => paths.get(id))
  it('writes ids as relative paths from the writing file', () => {
    expect(map('home.md')(pageHref('plan'))).toBe('projects/plan.md')
    expect(map('projects/plan.md')(pageHref('home'))).toBe('../home.md')
  })
  it('encodes unsafe characters', () => {
    expect(map('home.md')(pageHref('sp'))).toBe('my%20notes/a%20b.md')
  })
  it('drops a link to a page that no longer exists', () => {
    expect(map('home.md')(pageHref('gone'))).toBeNull()
  })
  it('passes web links through and never emits the npkn: scheme', () => {
    expect(map('home.md')('https://x.com')).toBe('https://x.com')
    expect(map('home.md')('npkn:')).toBeNull()
  })
})
