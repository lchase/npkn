import { describe, expect, it } from 'vitest'
import { effectiveRegistry } from './labels'
import { extractTodos, setTodoClosed } from './todos'
import type { Doc, Page } from './types'

const t = (text: string): Doc => ({ type: 'text', text })
const chip = (value: string, kind = 'category', iso: string | null = null): Doc => ({ type: 'chip', attrs: { kind, value, iso } })
const item = (checked: boolean, ...c: Doc[]): Doc => ({ type: 'taskItem', attrs: { checked }, content: [{ type: 'paragraph', content: c }] })
const page = (...items: Doc[]): Page => ({
  id: 'p', parentId: null, title: 'P', createdAt: 1, updatedAt: 1,
  content: { type: 'doc', content: [{ type: 'taskList', content: items }] },
})

const reg = effectiveRegistry({ waiting: { kind: 'status', group: 'active' } })

describe('extractTodos with statuses', () => {
  const todos = extractTodos(
    [
      page(
        item(false, t('plain '), chip('work')),
        item(false, t('in flight '), chip('doing'), chip('work')),
        item(false, t('stuck '), chip('blocked')),
        item(true, t('ticked '), chip('work')),
        item(false, t('labelled done '), chip('done'), chip('work')),
        item(false, t('custom '), chip('Waiting')),
      ),
    ],
    reg,
  )
  const by = (text: string) => todos.find(x => x.text === text)!

  it('separates status labels from categories', () => {
    expect(by('in flight').categories).toEqual(['work'])
    expect(by('in flight').status).toEqual({ label: 'doing', group: 'active' })
  })
  it('a todo with no status label has status null and stays open', () => {
    expect(by('plain').status).toBeNull()
    expect(by('plain').closed).toBe(false)
  })
  it('active statuses are still open', () => {
    expect(by('in flight').closed).toBe(false)
    expect(by('stuck').closed).toBe(false)
  })
  it('closed means ticked OR carrying a done status', () => {
    expect(by('ticked').closed).toBe(true)
    expect(by('labelled done').closed).toBe(true)
    expect(by('labelled done').checked).toBe(false)
  })
  it('honours user-defined statuses, case-insensitively', () => {
    expect(by('custom').status?.group).toBe('active')
    expect(by('custom').categories).toEqual([])
  })
})

describe('setTodoClosed', () => {
  it('ticks a todo', () => {
    const p = page(item(false, t('a ')))
    const next = setTodoClosed(p, 0, true, reg)
    expect(next.content![0].content![0].attrs!.checked).toBe(true)
  })

  it('reopening unticks it AND removes a done status, but keeps other labels and the date', () => {
    const p = page(item(true, t('a '), chip('done'), chip('work'), chip('x', 'date', '2026-10-20')))
    const next = setTodoClosed(p, 0, false, reg)
    const it0 = next.content![0].content![0]
    expect(it0.attrs!.checked).toBe(false)
    const kept = it0.content![0].content!.filter(n => n.type === 'chip').map(n => n.attrs!.value)
    expect(kept).toEqual(['work', 'x'])
  })

  it('reopening leaves an active status alone', () => {
    const p = page(item(true, t('a '), chip('doing')))
    const next = setTodoClosed(p, 0, false, reg)
    expect(next.content![0].content![0].content![0].content!.some(n => n.attrs?.value === 'doing')).toBe(true)
  })

  it('does not mutate the original page', () => {
    const p = page(item(true, t('a '), chip('done')))
    setTodoClosed(p, 0, false, reg)
    expect(p.content!.content![0].content![0].attrs!.checked).toBe(true)
    expect(JSON.stringify(p)).toContain('"done"')
  })
})
