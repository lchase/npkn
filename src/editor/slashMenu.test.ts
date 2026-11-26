import { describe, expect, it } from 'vitest'
import { matchSlash } from './slashMenu'

const titles = (q: string) => matchSlash(q).map(c => c.title)

describe('matchSlash', () => {
  it('lists everything for an empty query', () => expect(titles('')).toHaveLength(11))
  it('matches title prefixes and keywords', () => {
    expect(titles('tod')).toEqual(['Todo list'])
    expect(titles('h2')).toEqual(['Heading 2'])
    expect(titles('task')).toEqual(['Todo list'])
  })
  it('matches inside a title', () => expect(titles('list')).toEqual(['Todo list', 'Bullet list', 'Numbered list']))
  it('returns nothing for junk', () => expect(titles('zzz')).toEqual([]))
})
