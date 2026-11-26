import { describe, expect, it } from 'vitest'
import { effectiveRegistry, labelOptions, matchLabels } from './labels'

const opts = labelOptions(effectiveRegistry(), new Map([['work', 5], ['client-acme', 2], ['doc', 9], ['redo', 1]]))
const names = (q: string, limit?: number) => matchLabels(opts, q, limit).map(o => o.name)

describe('matchLabels', () => {
  it('lists statuses first, then most used, for a bare @', () => {
    const all = names('', 20)
    expect(all.slice(0, 5).sort()).toEqual(['blocked', 'done', 'doing', 'in-review', 'todo'].sort())
    expect(all.slice(5)).toEqual(['doc', 'work', 'client-acme', 'redo'])
  })

  it('ranks prefix matches before substring matches, case-insensitively', () => {
    expect(names('DO')).toEqual(['doing', 'done', 'doc', 'todo', 'redo'])
  })

  it('matches inside a hyphenated name and returns nothing for a miss', () => {
    expect(names('acme')).toEqual(['client-acme'])
    expect(names('zzz')).toEqual([])
  })

  it('flags statuses and carries use counts', () => {
    expect(opts.find(o => o.name === 'doing')).toMatchObject({ status: true, count: 0 })
    expect(opts.find(o => o.name === 'work')).toMatchObject({ status: false, count: 5 })
  })
})
