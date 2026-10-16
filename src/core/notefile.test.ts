import { describe, expect, it } from 'vitest'
import { buildNoteFile, conflictPath, parseNoteFile, planPaths, slug, stripYamlKey, upsertYamlKey, withId, type KnownEntry } from './notefile'
import type { Doc, Page } from './types'

const t = (text: string, ...marks: string[]): Doc => ({ type: 'text', text, ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) })
const p = (...c: Doc[]): Doc => ({ type: 'paragraph', content: c })
const doc = (...c: Doc[]): Doc => ({ type: 'doc', content: c })

const page = (over: Partial<Page> = {}): Page => ({
  id: 'id-1',
  parentId: null,
  title: 'Hello',
  content: doc(p(t('Body text'))),
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('upsertYamlKey / stripYamlKey', () => {
  it('inserts at the top when missing', () => {
    expect(upsertYamlKey('type: note\n', 'id', '"a"')).toBe('id: "a"\ntype: note\n')
  })
  it('works on empty yaml', () => {
    expect(upsertYamlKey('', 'id', '"a"')).toBe('id: "a"\n')
  })
  it('replaces an existing line and leaves the rest alone', () => {
    const y = '# my comment\ntitle: Old\ntags: [a, b]\n'
    expect(upsertYamlKey(y, 'title', '"New"')).toBe('# my comment\ntitle: "New"\ntags: [a, b]\n')
  })
  it('does not touch an indented key of the same name', () => {
    const y = 'meta:\n  title: nested\n'
    expect(upsertYamlKey(y, 'title', '"Top"')).toBe('title: "Top"\nmeta:\n  title: nested\n')
  })
  it('strips a key', () => {
    expect(stripYamlKey('id: "x"\ntype: note\n', 'id')).toBe('type: note\n')
  })
})

describe('buildNoteFile / parseNoteFile', () => {
  it('writes id, type and title and round-trips them', () => {
    const text = buildNoteFile(page({ title: 'Weekly sync, Oct 5' }))
    expect(text.startsWith('---\nid: "id-1"\n')).toBe(true)
    expect(text).toContain('type: note')
    const back = parseNoteFile(text, 'x.md')
    expect(back.id).toBe('id-1')
    expect(back.title).toBe('Weekly sync, Oct 5')
    expect(back.content?.content?.[0].content?.[0].text).toBe('Body text')
  })

  it('hides the id from the user-visible front matter', () => {
    const back = parseNoteFile(buildNoteFile(page()), 'x.md')
    expect(back.frontmatter).toBeDefined()
    expect(back.frontmatter).not.toMatch(/^id:/m)
    expect(back.frontmatter).toContain('type: note')
  })

  it('keeps unknown keys, order and comments', () => {
    const fm = '# owner notes\ntype: runbook\nowner: Sam\ncustom_key: [1, 2]\n'
    const text = buildNoteFile(page({ frontmatter: fm }))
    expect(text).toContain('# owner notes')
    expect(text).toContain('owner: Sam')
    expect(text).toContain('custom_key: [1, 2]')
    expect(text).toContain('type: runbook')
    expect(text).not.toContain('type: note')
    const back = parseNoteFile(text, 'x.md')
    expect(back.frontmatter).toContain('# owner notes')
    expect(back.frontmatter).toContain('custom_key: [1, 2]')
  })

  it('is stable: building twice from a parsed file gives the same text', () => {
    const first = buildNoteFile(page({ frontmatter: 'type: meeting\ntags: [a]\n', title: 'A: B' }))
    const parsed = parseNoteFile(first, 'x.md')
    const second = buildNoteFile(page({ title: parsed.title, frontmatter: parsed.frontmatter, content: parsed.content }))
    expect(second).toBe(first)
  })

  it('survives a title that needs quoting', () => {
    for (const title of ['Colon: here', '#hash', 'quote " mark', "it's", '- dash', 'yes', '123']) {
      const back = parseNoteFile(buildNoteFile(page({ title })), 'x.md')
      expect(back.title).toBe(title)
    }
  })

  it('round-trips chips, todos and code', () => {
    const content = doc(
      p(t('Call ', ), { type: 'chip', attrs: { kind: 'category', value: 'work', iso: null } }, t(' ')),
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(t('Do it '), { type: 'chip', attrs: { kind: 'date', value: 'x', iso: '2026-10-20' } })] }] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1' }] },
    )
    const back = parseNoteFile(buildNoteFile(page({ content })), 'x.md')
    const json = JSON.stringify(back.content)
    expect(json).toContain('"value":"work"')
    expect(json).toContain('"iso":"2026-10-20"')
    expect(json).toContain('"taskItem"')
    expect(json).toContain('const a = 1')
  })

  it('reports no id for a hand-written file', () => {
    const back = parseNoteFile('# Just a note\n\nSome text\n', 'just-a-note.md')
    expect(back.id).toBeNull()
    expect(back.title).toBe('Just a note')
  })
})

describe('withId', () => {
  it('adds only an id line to a file with front matter', () => {
    const src = '---\ntype: note\ntitle: A\n---\n\nBody  with   odd   spacing\n* star bullet\n'
    const out = withId(src, 'abc')
    expect(out).toBe('---\nid: "abc"\ntype: note\ntitle: A\n---\n\nBody  with   odd   spacing\n* star bullet\n')
  })
  it('adds a front matter block to a bare file without reformatting the body', () => {
    const out = withId('# Title\n\n* a\n', 'abc')
    expect(out).toBe('---\nid: "abc"\n---\n\n# Title\n\n* a\n')
    expect(parseNoteFile(out, 'f.md').id).toBe('abc')
  })
})

describe('planPaths', () => {
  const known = (entries: Record<string, KnownEntry>) => new Map(Object.entries(entries))

  it('lays out parents and children', () => {
    const paths = planPaths(
      [page({ id: 'a', title: 'Projects' }), page({ id: 'b', title: 'Plan', parentId: 'a', createdAt: 2 })],
      known({}),
    )
    expect(paths.get('a')).toBe('projects.md')
    expect(paths.get('b')).toBe('projects/plan.md')
  })

  it('disambiguates same-titled siblings and ignores case', () => {
    const paths = planPaths(
      [page({ id: 'a', title: 'Notes' }), page({ id: 'b', title: 'notes', createdAt: 2 }), page({ id: 'c', title: 'NOTES', createdAt: 3 })],
      known({}),
    )
    expect(new Set(paths.values()).size).toBe(3)
    expect(paths.get('a')).toBe('notes.md')
  })

  it('keeps an existing path when nothing changed, even a hand-made one', () => {
    const paths = planPaths([page({ id: 'a', title: 'Alpha' })], known({ a: { path: 'my folder/alpha.md', title: 'Alpha', parentId: null } }))
    expect(paths.get('a')).toBe('my folder/alpha.md')
  })

  it('renames when the title changes', () => {
    const paths = planPaths([page({ id: 'a', title: 'Beta' })], known({ a: { path: 'alpha.md', title: 'Alpha', parentId: null } }))
    expect(paths.get('a')).toBe('beta.md')
  })

  it('moves children when the parent is renamed', () => {
    const paths = planPaths(
      [page({ id: 'a', title: 'New name' }), page({ id: 'b', title: 'Child', parentId: 'a', createdAt: 2 })],
      known({
        a: { path: 'old-name.md', title: 'Old name', parentId: null },
        b: { path: 'old-name/child.md', title: 'Child', parentId: 'a' },
      }),
    )
    expect(paths.get('a')).toBe('new-name.md')
    expect(paths.get('b')).toBe('new-name/child.md')
  })

  it("a new page doesn't take a path an unchanged page still owns", () => {
    const paths = planPaths(
      [page({ id: 'a', title: 'Notes', createdAt: 5 }), page({ id: 'b', title: 'Notes', createdAt: 1 })],
      known({ a: { path: 'notes.md', title: 'Notes', parentId: null } }),
    )
    expect(paths.get('a')).toBe('notes.md')
    expect(paths.get('b')).toBe('notes-2.md')
  })

  it('survives a parent cycle and a missing parent', () => {
    const paths = planPaths(
      [page({ id: 'a', title: 'A', parentId: 'b' }), page({ id: 'b', title: 'B', parentId: 'a', createdAt: 2 }), page({ id: 'c', title: 'C', parentId: 'gone', createdAt: 3 })],
      known({}),
    )
    expect(paths.size).toBe(3)
    expect(paths.get('c')).toBe('c.md')
  })
})

describe('misc', () => {
  it('slugs', () => {
    expect(slug('Weekly sync, October 5')).toBe('weekly-sync-october-5')
    expect(slug('???')).toBe('untitled')
    expect(slug('')).toBe('untitled')
  })
  it('conflict path', () => {
    expect(conflictPath('a/b.md', new Date('2026-10-12T09:30:15.000Z'))).toBe('a/b.conflict-2026-10-12T09-30-15.md')
  })
})
