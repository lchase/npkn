import { describe, expect, it } from 'vitest'
import { appendToDoc, parseEdits, replaceInDoc } from './noteEdits'
import type { Doc } from './types'

const fence = (o: unknown) => '```npkn-edit\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```'
const p = (...c: Doc[]): Doc => ({ type: 'paragraph', content: c })
const t = (text: string, marks?: Doc['marks']): Doc => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const doc = (...c: Doc[]): Doc => ({ type: 'doc', content: c })

describe('parseEdits', () => {
  it('pulls out each edit and removes the fences from the shown text', () => {
    const r = parseEdits(
      `I'll add that.\n${fence({ op: 'create', title: 'Plan', body: '- a' })}\n${fence({ op: 'append', page: 2, body: 'more' })}\nDone.`,
    )
    expect(r.edits).toEqual([
      { op: 'create', title: 'Plan', body: '- a' },
      { op: 'append', page: 2, body: 'more' },
    ])
    expect(r.text).toBe("I'll add that.\n\nDone.")
  })

  it('reads a replace with its "with" field', () => {
    expect(parseEdits(fence({ op: 'replace', page: 1, find: 'old', with: 'new' })).edits).toEqual([
      { op: 'replace', page: 1, find: 'old', with: 'new' },
    ])
  })

  it('marks malformed or incomplete edits invalid instead of dropping them', () => {
    const bad = [
      fence('{not json'),
      fence({ op: 'create', title: '', body: 'x' }),
      fence({ op: 'append', page: 0, body: 'x' }),
      fence({ op: 'append', page: 'two', body: 'x' }),
      fence({ op: 'replace', page: 1, find: '', with: 'x' }),
      fence({ op: 'delete', page: 1 }),
    ].join('\n')
    expect(parseEdits(bad).edits.map(e => e.op)).toEqual(Array(6).fill('invalid'))
    expect(parseEdits(fence('{not json')).edits).toEqual([{ op: 'invalid', raw: '{not json' }])
  })

  it('accepts an edit in an unlabelled or json fence, but not other code fences', () => {
    const obj = '{"op":"create","title":"T","body":"b"}'
    expect(parseEdits('```\n\n' + obj + '\n\n```').edits).toEqual([{ op: 'create', title: 'T', body: 'b' }])
    expect(parseEdits('```json\n' + obj + '\n```').edits).toHaveLength(1)
    const keep = '```json\n{"name":"x"}\n```'
    expect(parseEdits(keep)).toEqual({ text: keep, edits: [] })
  })

  it('accepts an unfenced edit on its own line, with or without the label', () => {
    const obj = JSON.stringify({ op: 'create', title: 'Garden plan', body: '- kale' })
    expect(parseEdits(obj)).toEqual({ text: '', edits: [{ op: 'create', title: 'Garden plan', body: '- kale' }] })
    expect(parseEdits('Here you go.\nnpkn-edit ' + obj + '\nSave it?')).toEqual({
      text: 'Here you go.\n\nSave it?',
      edits: [{ op: 'create', title: 'Garden plan', body: '- kale' }],
    })
    const other = '{"name":"x"}'
    expect(parseEdits(other)).toEqual({ text: other, edits: [] })
    expect(parseEdits('Use {"op":"create"} inline').edits).toEqual([])
  })

  it('hides an unfenced edit still streaming and a stray label line', () => {
    expect(parseEdits('Sure.\n{"op":"create","ti').text).toBe('Sure.')
    expect(parseEdits('npkn-edit\n' + fence({ op: 'append', page: 1, body: 'x' }) + '\nAdded.').text).toBe('Added.')
  })

  it('hides a fence that is still streaming and ignores ordinary code fences', () => {
    expect(parseEdits('Sure.\n```npkn-edit\n{"op":"crea').text).toBe('Sure.')
    expect(parseEdits('Sure.\n```\n{"op":"crea').text).toBe('Sure.')
    expect(parseEdits('```ts\nconst a = 1\n```').edits).toEqual([])
  })
})

describe('replaceInDoc', () => {
  it('replaces a unique match and keeps marks, siblings and other blocks', () => {
    const d = doc(p(t('Call '), t('Ana', [{ type: 'bold' }]), t(' on Friday')), p(t('other')))
    const r = replaceInDoc(d, 'Friday', 'Monday')
    expect(r).toEqual({ ok: true, doc: doc(p(t('Call '), t('Ana', [{ type: 'bold' }]), t(' on Monday')), p(t('other'))) })
    expect(d.content![0].content![2].text).toBe(' on Friday') // input not mutated
  })

  it('treats $ in the replacement literally', () => {
    const r = replaceInDoc(doc(p(t('cost: x'))), 'x', '$& $1')
    expect(r.ok && r.doc.content![0].content![0].text).toBe('cost: $& $1')
  })

  it('refuses no match, several matches, and text split across formatting', () => {
    expect(replaceInDoc(doc(p(t('abc'))), 'zzz', 'y')).toMatchObject({ ok: false })
    expect(replaceInDoc(doc(p(t('aa'), t(' aa'))), 'aa', 'y')).toMatchObject({ ok: false, reason: expect.stringContaining('2 times') })
    expect(replaceInDoc(doc(p(t('He'), t('llo', [{ type: 'bold' }]))), 'Hello', 'y')).toMatchObject({ ok: false })
    expect(replaceInDoc(null, 'a', 'b')).toMatchObject({ ok: false })
  })

  it('drops a text node that becomes empty rather than leaving an invalid one', () => {
    const r = replaceInDoc(doc(p(t('gone'), t(' stays'))), 'gone', '')
    expect(r).toEqual({ ok: true, doc: doc(p(t(' stays'))) })
  })
})

describe('appendToDoc', () => {
  it('adds blocks after existing content, and builds a doc from nothing', () => {
    expect(appendToDoc(doc(p(t('a'))), [p(t('b'))]).content).toEqual([p(t('a')), p(t('b'))])
    expect(appendToDoc(null, [p(t('b'))])).toEqual({ type: 'doc', content: [p(t('b'))] })
  })
})
