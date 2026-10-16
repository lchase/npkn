import { beforeEach, describe, expect, it } from 'vitest'
import { FsaNotebook, checkRel } from './fsaNotebook'

// A tiny in-memory File System Access implementation: just the surface FsaNotebook uses.
let clock = 1000
class FakeFile {
  constructor(private owner: FakeFileHandle) {}
  get lastModified() { return this.owner.mtime }
  async text() { return this.owner.text }
}
class FakeFileHandle {
  kind = 'file' as const
  text = ''
  mtime = ++clock
  constructor(public name: string) {}
  async getFile() { return new FakeFile(this) as unknown as File }
  async createWritable() {
    let buf = ''
    return { write: async (t: string) => { buf += t }, close: async () => { this.text = buf; this.mtime = ++clock } }
  }
}
class FakeDir {
  kind = 'directory' as const
  children = new Map<string, FakeDir | FakeFileHandle>()
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    const c = this.children.get(name)
    if (c instanceof FakeDir) return c
    if (c) throw Object.assign(new Error('mismatch'), { name: 'TypeMismatchError' })
    if (!o?.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' })
    const d = new FakeDir(name); this.children.set(name, d); return d
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    const c = this.children.get(name)
    if (c instanceof FakeFileHandle) return c
    if (c) throw Object.assign(new Error('mismatch'), { name: 'TypeMismatchError' })
    if (!o?.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' })
    const f = new FakeFileHandle(name); this.children.set(name, f); return f
  }
  async removeEntry(name: string) {
    const c = this.children.get(name)
    if (!c) throw Object.assign(new Error('nf'), { name: 'NotFoundError' })
    if (c instanceof FakeDir && c.children.size) throw Object.assign(new Error('not empty'), { name: 'InvalidModificationError' })
    this.children.delete(name)
  }
  async *entries() { for (const [k, v] of this.children) yield [k, v] as const }
}

const paths = (d: FakeDir, prefix = ''): string[] =>
  [...d.children].flatMap(([n, c]) => (c instanceof FakeDir ? paths(c, prefix + n + '/') : [prefix + n]))

let root: FakeDir
let nb: FsaNotebook
beforeEach(() => {
  root = new FakeDir('notes')
  nb = new FsaNotebook(root as unknown as FileSystemDirectoryHandle)
})

describe('checkRel', () => {
  it('accepts plain relative markdown paths', () => {
    expect(checkRel('a/b.md')).toEqual(['a', 'b.md'])
  })
  it.each(['', '/etc/x.md', '../x.md', 'a/../x.md', '.hidden/x.md', 'a/.x.md', 'a//b.md', 'x.txt', 'a/b'])('rejects %j', p => {
    expect(() => checkRel(p)).toThrow()
  })
})

describe('write', () => {
  it('creates files and parent folders and returns the mtime', async () => {
    const r = await nb.write('a/b/c.md', 'hi', { expect: null })
    expect(paths(root)).toEqual(['a/b/c.md'])
    expect(typeof r.mtimeMs).toBe('number')
  })

  it('refuses to overwrite when it must not exist', async () => {
    await nb.write('x.md', 'one')
    await expect(nb.write('x.md', 'two', { expect: null })).rejects.toThrow('EXISTS')
    expect((await nb.scan({})).files[0].text).toBe('one')
  })

  it('refuses when the file changed since we last saw it', async () => {
    const { mtimeMs } = await nb.write('x.md', 'one')
    await nb.write('x.md', 'changed elsewhere') // someone else
    await expect(nb.write('x.md', 'mine', { expect: mtimeMs })).rejects.toThrow('CHANGED')
    expect((await nb.scan({})).files[0].text).toBe('changed elsewhere')
  })

  it('overwrites when the mtime matches', async () => {
    const { mtimeMs } = await nb.write('x.md', 'one')
    await nb.write('x.md', 'two', { expect: mtimeMs })
    expect((await nb.scan({})).files[0].text).toBe('two')
  })

  it('rejects bad paths', async () => {
    await expect(nb.write('../x.md', 'x')).rejects.toThrow()
    await expect(nb.write('.trash/x.md', 'x')).rejects.toThrow()
  })
})

describe('scan', () => {
  it('lists only markdown, skips hidden and node_modules, and recurses', async () => {
    await nb.write('a.md', 'A')
    await nb.write('dir/b.markdown', 'B')
    await (await root.getFileHandle('notes.txt', { create: true })).createWritable().then(async w => { await w.write('x'); await w.close() })
    await nb.write('node_modules/x.md', 'N').catch(() => {})
    const hidden = await root.getDirectoryHandle('.git', { create: true })
    await (await hidden.getFileHandle('c.md', { create: true })).createWritable().then(async w => { await w.write('C'); await w.close() })
    const got = (await nb.scan({})).files.map(f => f.path).sort()
    expect(got).toContain('a.md')
    expect(got).toContain('dir/b.markdown')
    expect(got.some(p => p.includes('.git') || p.endsWith('.txt'))).toBe(false)
  })

  it('only returns text for files whose mtime differs from what the caller knows', async () => {
    const { mtimeMs } = await nb.write('a.md', 'A')
    const same = (await nb.scan({ 'a.md': mtimeMs })).files[0]
    expect(same.text).toBeUndefined()
    const diff = (await nb.scan({ 'a.md': mtimeMs - 1 })).files[0]
    expect(diff.text).toBe('A')
  })
})

describe('move', () => {
  it('moves content, removes the source and prunes empty folders', async () => {
    await nb.write('old/deep/x.md', 'body')
    const r = await nb.move('old/deep/x.md', 'new.md')
    expect(r?.mtimeMs).toBeTypeOf('number')
    expect(paths(root)).toEqual(['new.md'])
    expect(root.children.has('old')).toBe(false)
    expect((await nb.scan({})).files[0].text).toBe('body')
  })

  it('never overwrites an existing destination', async () => {
    await nb.write('a.md', 'A')
    await nb.write('b.md', 'B')
    await expect(nb.move('a.md', 'b.md')).rejects.toThrow('EXISTS')
    const texts = Object.fromEntries((await nb.scan({})).files.map(f => [f.path, f.text]))
    expect(texts).toEqual({ 'a.md': 'A', 'b.md': 'B' })
  })

  it('returns null when the source is gone', async () => {
    expect(await nb.move('nope.md', 'x.md')).toBeNull()
  })

  it("the returned mtime is the file's new mtime (so a follow-up write with expect succeeds)", async () => {
    await nb.write('a.md', 'A')
    const m = await nb.move('a.md', 'b.md')
    await expect(nb.write('b.md', 'A2', { expect: m!.mtimeMs })).resolves.toBeTruthy()
  })
})

describe('trash', () => {
  it('keeps a copy under .trash and removes the original', async () => {
    await nb.write('p/doc.md', 'keep me')
    expect(await nb.trash('p/doc.md')).toBe(true)
    const left = paths(root)
    expect(left.length).toBe(1)
    expect(left[0]).toMatch(/^\.trash\/.*-doc\.md$/)
    expect(root.children.has('p')).toBe(false)
    const trashed = (root.children.get('.trash') as FakeDir).children.values().next().value as FakeFileHandle
    expect(trashed.text).toBe('keep me')
  })

  it('is a no-op for a missing file', async () => {
    expect(await nb.trash('nope.md')).toBe(false)
  })
})
