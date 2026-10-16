import type { Page } from './types'
import { frontText, parseFront } from './frontmatter'
import { pageToMarkdown } from './markdown'
import { slug } from './notefile'
import { fileLinkMapper } from './links'

// ---------------------------------------------------------------------------------------------
// Bundle export (folder tree of concept files + index.md, stored in an uncompressed zip)
// ---------------------------------------------------------------------------------------------

export function bundleFiles(pages: Page[]): { path: string; text: string }[] {
  const byId = new Map(pages.map(p => [p.id, p]))
  const used = new Set<string>()
  const pathOf = new Map<string, string>()

  const resolve = (p: Page): string => {
    const hit = pathOf.get(p.id)
    if (hit) return hit
    const parent = p.parentId ? byId.get(p.parentId) : undefined
    const dir = parent ? resolve(parent).replace(/\.md$/, '') + '/' : ''
    let path = `${dir}${slug(p.title)}.md`
    for (let i = 2; used.has(path); i++) path = `${dir}${slug(p.title)}-${i}.md`
    used.add(path)
    pathOf.set(p.id, path)
    return path
  }

  pages.forEach(resolve)
  // Links between pages become relative paths from the file that contains them.
  const files = pages.map(p => ({
    path: resolve(p),
    text: pageToMarkdown(p, { linkHref: fileLinkMapper(resolve(p), id => pathOf.get(id)) }),
  }))

  const index = [
    '# Index',
    '',
    ...pages
      .slice()
      .sort((a, b) => resolve(a).localeCompare(resolve(b)))
      .map(p => {
        const parsed = parseFront(p.frontmatter)
        const desc = parsed?.ok ? frontText(parsed.data, 'description') : ''
        return `- [${p.title || 'Untitled'}](${encodeURI(resolve(p))})${desc ? ' — ' + desc : ''}`
      }),
    '',
  ].join('\n')

  return [{ path: 'index.md', text: index }, ...files]
}

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

export function makeZip(files: { path: string; text: string }[]): Blob {
  const enc = new TextEncoder()
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = enc.encode(f.path)
    const data = enc.encode(f.text)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, data)

    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(12, dosTime, true)
    c.setUint16(14, dosDate, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, data.length, true)
    c.setUint32(24, data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)

    offset += 30 + name.length + data.length
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' })
}

/** Browser-only: hands a Blob to the user as a file download. */
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fileSlug = slug

// ---------------------------------------------------------------------------------------------
// Bundle import
// ---------------------------------------------------------------------------------------------

/** Read a zip (stored or deflate). Enough for bundles we export and for common OKF folders. */
export async function readZip(buf: ArrayBuffer): Promise<{ path: string; text: string }[]> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const dec = new TextDecoder()

  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a zip file')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const out: { path: string; text: string }[] = []

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory')
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue

    const lNameLen = view.getUint16(localOffset + 26, true)
    const lExtraLen = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const raw = bytes.subarray(start, start + compSize)

    let data: Uint8Array
    if (method === 0) data = raw
    else if (method === 8) {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      data = new Uint8Array(await new Response(stream).arrayBuffer())
    } else continue
    out.push({ path: name, text: dec.decode(data) })
  }
  return out
}

export interface PlannedPage {
  path: string
  /** Path of the parent page's file, or null for a top-level page. */
  parent: string | null
  text: string
}

/**
 * Turn bundle files into a page hierarchy. `a/b.md` is a child of `a.md` when that file exists
 * (the layout bundleFiles writes); otherwise it's top-level. Reserved index.md/log.md are skipped.
 * Parents always come before their children.
 */
export function planImport(files: { path: string; text: string }[]): PlannedPage[] {
  const md = files.filter(f => /\.(md|markdown)$/i.test(f.path) && !/(^|\/)(index|log)\.md$/i.test(f.path))
  const known = new Set(md.map(f => f.path))
  const planned = md.map(f => {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    const parent = dir && known.has(dir + '.md') ? dir + '.md' : null
    return { path: f.path, parent, text: f.text }
  })
  const depth = (p: string) => p.split('/').length
  return planned.sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path))
}
