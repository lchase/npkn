import { describe, expect, it } from 'vitest'
import { canMoveUnder } from './tree'

// a > b > c, d at the top level
const pages = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: null },
]

describe('canMoveUnder', () => {
  it('refuses itself and its descendants', () => {
    expect(canMoveUnder(pages, 'a', 'a')).toBe(false)
    expect(canMoveUnder(pages, 'a', 'b')).toBe(false)
    expect(canMoveUnder(pages, 'a', 'c')).toBe(false)
  })
  it('allows other pages, ancestors and the top level', () => {
    expect(canMoveUnder(pages, 'a', 'd')).toBe(true)
    expect(canMoveUnder(pages, 'c', 'a')).toBe(true)
    expect(canMoveUnder(pages, 'c', null)).toBe(true)
  })
})
