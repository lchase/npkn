import type { NotebookBridge } from './desktop'

/**
 * Notebook-folder operations on a File System Access directory handle. This is the browser's
 * counterpart of desktop/notebook.cjs and follows the same rules:
 *
 *  - paths are relative, inside the folder, no hidden segments, markdown only
 *  - `write` can insist the file is new (expect: null) or unchanged since we last saw it
 *  - nothing is deleted: removed pages are moved into .trash/
 *
 * It knows nothing about persistence or permissions (see browserNotebook.ts), so it can be tested
 * against a fake handle.
 */

const MD = /\.(md|markdown)$/i

export function checkRel(rel: string): string[] {
  if (typeof rel !== 'string' || !rel || rel.startsWith('/') || rel.includes('\0')) throw new Error('Bad path')
  const parts = rel.split('/')
  if (parts.some(s => s === '' || s === '.' || s === '..' || s.startsWith('.'))) throw new Error('Bad path')
  if (!MD.test(rel)) throw new Error('Not a markdown file')
  return parts
}

const notFound = (e: unknown) => (e as DOMException)?.name === 'NotFoundError'

export class FsaNotebook {
  constructor(private root: FileSystemDirectoryHandle) {}

  private async dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let d = this.root
    for (const p of parts) d = await d.getDirectoryHandle(p, { create })
    return d
  }

  private async file(rel: string): Promise<File | null> {
    const parts = checkRel(rel)
    const name = parts.pop()!
    try {
      const d = await this.dir(parts, false)
      return await (await d.getFileHandle(name)).getFile()
    } catch (e) {
      if (notFound(e) || (e as DOMException)?.name === 'TypeMismatchError') return null
      throw e
    }
  }

  private async put(rel: string, text: string): Promise<number> {
    const parts = checkRel(rel)
    const name = parts.pop()!
    const d = await this.dir(parts, true)
    const fh = await d.getFileHandle(name, { create: true })
    const w = await (fh as any).createWritable() // writes to a swap file; the swap is committed on close
    await w.write(text)
    await w.close()
    return (await fh.getFile()).lastModified
  }

  private async remove(rel: string) {
    const parts = checkRel(rel)
    const name = parts.pop()!
    const d = await this.dir(parts, false)
    await d.removeEntry(name)
    // Tidy empty folders upward. removeEntry is non-recursive, so a non-empty one just refuses.
    for (let i = parts.length; i > 0; i--) {
      try {
        await (await this.dir(parts.slice(0, i - 1), false)).removeEntry(parts[i - 1])
      } catch {
        break
      }
    }
  }

  async scan(known: Record<string, number>): Promise<{ root: string; files: { path: string; mtimeMs: number; text?: string }[] }> {
    const files: { path: string; mtimeMs: number; text?: string }[] = []
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, h] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        if (name.startsWith('.') || name === 'node_modules') continue
        if (h.kind === 'directory') await walk(h as FileSystemDirectoryHandle, prefix + name + '/')
        else if (MD.test(name)) {
          try {
            const f = await (h as FileSystemFileHandle).getFile()
            const rel = prefix + name
            files.push({ path: rel, mtimeMs: f.lastModified, ...(known[rel] === f.lastModified ? {} : { text: await f.text() }) })
          } catch {
            /* vanished mid-scan; the next scan settles it */
          }
        }
      }
    }
    await walk(this.root, '')
    return { root: this.root.name, files }
  }

  async write(rel: string, text: string, opts?: { expect?: number | null }): Promise<{ mtimeMs: number }> {
    if (typeof text !== 'string') throw new Error('Bad content')
    if (opts && 'expect' in opts) {
      const existing = await this.file(rel)
      if (opts.expect === null && existing) throw new Error('EXISTS')
      if (typeof opts.expect === 'number' && existing && existing.lastModified !== opts.expect) throw new Error('CHANGED')
    }
    return { mtimeMs: await this.put(rel, text) }
  }

  /** Copy then delete (the API has no portable rename), so a crash in between leaves a duplicate, never a loss. */
  async move(from: string, to: string): Promise<{ mtimeMs: number } | null> {
    if (from === to) return null
    const src = await this.file(from)
    if (!src) return null
    if (await this.file(to)) throw new Error('EXISTS: destination already exists')
    const mtimeMs = await this.put(to, await src.text())
    await this.remove(from)
    return { mtimeMs }
  }

  async trash(rel: string): Promise<boolean> {
    const src = await this.file(rel)
    if (!src) return false
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = rel.split('/').pop()!
    const trashDir = await this.dir(['.trash'], true)
    const fh = await trashDir.getFileHandle(`${stamp}-${name}`, { create: true })
    const w = await (fh as any).createWritable()
    await w.write(await src.text())
    await w.close()
    await this.remove(rel)
    return true
  }
}

export type FsaOps = Pick<NotebookBridge, 'scan' | 'write' | 'move' | 'trash'>
