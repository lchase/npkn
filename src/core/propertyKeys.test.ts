import { describe, expect, it } from 'vitest'
import { parseFront } from './frontmatter'
import { NEW_FRONT } from './frontmatter'
import { addYamlKey, renameYamlKey } from './notefile'
import { keyHints } from './propertyKeys'

const hint = (k: string) => keyHints([k])[0]?.suggestion

describe('keyHints', () => {
  it.each([
    ['privat', 'private'],
    ['priavte', 'private'], // transposition
    ['Private', 'private'], // case
    ['PRIVATE', 'private'],
    ['descripton', 'description'],
    ['tag', 'tags'],
    ['tpye', 'type'],
    ['statuss', 'status'],
    ['pined', 'pinned'],
  ])('%s -> %s', (typo, expected) => expect(hint(typo)).toBe(expected))

  it.each(['owner', 'custom_key', 'hiring_stage', 'zz', 'x', 'department', 'due', 'priority', 'url'])('leaves %j alone', k => {
    expect(hint(k)).toBeUndefined()
  })

  it('never flags real keys', () => {
    expect(keyHints(['type', 'title', 'description', 'tags', 'private', 'id', 'status', 'owner', 'date', 'pinned'])).toEqual([])
  })

  it("doesn't turn a legitimate custom key into a false alarm", () => {
    expect(keyHints(['candidate_name', 'salary_band', 'interviewer'])).toEqual([])
  })
})

describe('yaml key helpers', () => {
  it('addYamlKey appends once and keeps order', () => {
    expect(addYamlKey('type: note\ntags: []', 'private', 'true')).toBe('type: note\ntags: []\nprivate: true\n')
    expect(addYamlKey('type: note\nprivate: false\n', 'private', 'true')).toBe('type: note\nprivate: false\n')
    expect(addYamlKey('', 'type', 'note')).toBe('type: note\n')
  })
  it('renameYamlKey keeps the value and the comments', () => {
    expect(renameYamlKey('# hi\nprivat: true  # why\nx: 1\n', 'privat', 'private')).toBe('# hi\nprivate: true  # why\nx: 1\n')
  })
  it('does not rename a longer key that merely starts the same', () => {
    expect(renameYamlKey('privately: x\nprivat: y\n', 'privat', 'private')).toBe('privately: x\nprivate: y\n')
  })
})

describe('NEW_FRONT', () => {
  it('parses, keeps the hints as comments, and does not mark the page private', () => {
    const text = NEW_FRONT('My page')
    const p = parseFront(text)
    expect(p?.ok).toBe(true)
    if (p?.ok) {
      expect(p.data.type).toBe('note')
      expect(p.data.title).toBe('My page')
      expect(p.data.private).toBeUndefined()
    }
    expect(text).toContain('# private: true')
  })
})
