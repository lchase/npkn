import { describe, expect, it } from 'vitest'
import { findMatches } from './find'

describe('findMatches', () => {
  it('is case-insensitive and returns every match', () => {
    expect(findMatches('Note, NOTE, note', 'note')).toEqual([[0, 4], [6, 10], [12, 16]])
  })
  it('treats the query as plain text, not a pattern', () => {
    expect(findMatches('a.b axb (c)', 'a.b')).toEqual([[0, 3]])
    expect(findMatches('a.b axb (c)', '(c)')).toEqual([[8, 11]])
  })
  it('does not overlap matches', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([[0, 2], [2, 4]])
  })
  it('finds nothing for an empty query or no hit', () => {
    expect(findMatches('text', '')).toEqual([])
    expect(findMatches('text', 'zz')).toEqual([])
  })
  it('keeps offsets into the original text', () => {
    expect(findMatches('İstanbul istanbul', 'stan')).toEqual([[1, 5], [10, 14]])
  })
})
