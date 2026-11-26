import { describe, expect, it } from 'vitest'
import { push, startNav, step } from './history'

const k = (s: string) => s
const all = () => true

describe('history', () => {
  it('goes back and forward, and a new push drops forward entries', () => {
    let n = startNav('ask')
    for (const v of ['A', 'B', 'C']) n = push(n, v, k)
    n = step(step(n, -1, all, k), -1, all, k)
    expect(n.stack[n.at]).toBe('A')
    n = step(n, 1, all, k)
    expect(n.stack[n.at]).toBe('B')
    n = push(n, 'D', k)
    expect(n.stack).toEqual(['ask', 'A', 'B', 'D'])
    expect(step(n, 1, all, k)).toBe(n)
  })

  it('skips deleted entries and stays put when nothing is left', () => {
    let n = startNav('A')
    n = push(push(n, 'B', k), 'C', k)
    n = step(n, -1, v => v !== 'B', k)
    expect(n.stack[n.at]).toBe('A')
    expect(step(n, -1, all, k)).toBe(n)
  })

  it('ignores re-opening the current entry and keeps recent unique, newest first', () => {
    let n = startNav('A')
    n = push(push(push(n, 'B', k), 'B', k), 'C', k)
    expect(n.stack).toEqual(['A', 'B', 'C'])
    n = step(n, -1, all, k)
    expect(n.recent).toEqual(['B', 'C', 'A'])
  })
})
