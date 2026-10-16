// End-to-end test of BROWSER notebook-folder mode. Runs the app (via the Vite dev server, so the test
// can import modules) in Electron's Chromium with the desktop bridge switched off, so it behaves like a
// plain browser tab. The folder is a real File System Access directory handle from the origin-private
// file system, which exposes the same API as a user-picked folder without needing a picker dialog.
//
//   npm run test:browser
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ELECTRON = `${REPO}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'npkn-bud-'))
const PORT = 9555
const VITE = 5199
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '   <- ' + detail}`) }

let vite, proc, ws, id = 0
const pending = new Map()

async function startVite() {
  vite = spawn('npx', ['vite', '--port', String(VITE), '--strictPort'], { cwd: REPO, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try { if ((await fetch(`http://localhost:${VITE}/`)).ok) return } catch {}
  }
  throw new Error('vite did not start')
}

async function launch() {
  proc = spawn(ELECTRON, [`--remote-debugging-port=${PORT}`, `${REPO}/desktop/main.cjs`], {
    env: { ...process.env, NPKN_DEV_URL: `http://localhost:${VITE}`, NPKN_NO_NOTEBOOK: '1', NPKN_USER_DATA: UD }, stdio: 'ignore',
  })
  let target
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page' && t.url.startsWith(`http://localhost:${VITE}`)) } catch {}
  }
  if (!target) throw new Error('app did not start')
  await connect(target)
}

async function connect(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => (ws.onopen = r))
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  await sleep(1500)
}

const evalIn = async expression => {
  const r = await new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })) })
  if (r.result?.exceptionDetails) throw new Error('page error: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result.result.value
}
const waitFor = async (fn, ms = 9000, step = 300) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return false; await sleep(step) } }

// After a reload the page's JS context is new; wait for the app to be back.
const reloaded = async () => {
  await evalIn('location.reload()').catch(() => {})
  await sleep(2500)
  await waitFor(() => evalIn(`!!document.querySelector('aside')`).catch(() => false), 15000)
}

// In-page helpers over the OPFS folder, installed once per page load.
const HELPERS = `(() => {
  const root = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('nb', { create: true })
  const walk = async (d, p = '') => { const o = []; for await (const [n, h] of d.entries()) { if (h.kind === 'directory') o.push(...await walk(h, p + n + '/')); else o.push(p + n) } return o }
  const at = async (rel, create) => { const parts = rel.split('/'); const name = parts.pop(); let d = await root(); for (const s of parts) d = await d.getDirectoryHandle(s, { create }); return [d, name] }
  window.__nb = {
    list: async () => (await walk(await root())).sort(),
    read: async rel => { const [d, n] = await at(rel, false); return (await (await d.getFileHandle(n)).getFile()).text() },
    exists: async rel => { try { const [d, n] = await at(rel, false); await d.getFileHandle(n); return true } catch { return false } },
    mtime: async rel => { const [d, n] = await at(rel, false); return (await (await d.getFileHandle(n)).getFile()).lastModified },
    write: async (rel, text) => { const [d, n] = await at(rel, true); const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(text); await w.close(); return true },
    remove: async rel => { const [d, n] = await at(rel, false); await d.removeEntry(n); return true },
    mtimes: async () => { const o = {}; for (const f of await window.__nb.list()) if (!f.startsWith('.')) o[f] = await window.__nb.mtime(f); return o },
  }
  return true
})()`
const nb = {
  list: () => evalIn('window.__nb.list()'),
  read: rel => evalIn(`window.__nb.read(${JSON.stringify(rel)})`),
  exists: rel => evalIn(`window.__nb.exists(${JSON.stringify(rel)})`),
  write: (rel, text) => evalIn(`window.__nb.write(${JSON.stringify(rel)}, ${JSON.stringify(text)})`),
  remove: rel => evalIn(`window.__nb.remove(${JSON.stringify(rel)})`),
  mtimes: () => evalIn('window.__nb.mtimes()'),
}
const pages = () => evalIn(`new Promise(r=>{const q=indexedDB.open('notes'); q.onsuccess=()=>{const g=q.result.transaction('pages').objectStore('pages').getAll(); g.onsuccess=()=>r(JSON.stringify(g.result.map(p=>({id:p.id,title:p.title,parentId:p.parentId,text:JSON.stringify(p.content),fm:p.frontmatter}))))}})`).then(JSON.parse)
// Waiting happens here in Node, never with timers inside the page: the test window is occluded, and
// Chromium throttles timers in occluded windows to ~1s, which silently eats the short windows some
// scenarios (conflicts) depend on. In-page actions are synchronous.
const has = sel => evalIn(`!!document.querySelector(${JSON.stringify(sel)})`)
const rowExpr = t => `[...document.querySelectorAll('aside .nav-item')].find(e=>e.querySelector('.nav-title')?.textContent===${JSON.stringify(t)})`
const ui = {
  open: async t => {
    if (!(await waitFor(() => evalIn(`!!(${rowExpr(t)})`), 6000, 100))) return false
    await evalIn(`${rowExpr(t)}.click(); true`)
    return !!(await waitFor(() => has('.page .ProseMirror'), 6000, 100))
  },
  type: async txt => {
    await waitFor(() => has('.ProseMirror'), 6000, 100)
    return evalIn(`(()=>{const pm=document.querySelector('.ProseMirror'); pm.focus(); const sel=getSelection(); const rng=document.createRange(); rng.selectNodeContents(pm); rng.collapse(false); sel.removeAllRanges(); sel.addRange(rng); document.dispatchEvent(new Event('selectionchange')); return document.execCommand('insertText', false, ${JSON.stringify(txt)})})()`)
  },
  title: async t => {
    await waitFor(() => has('.page .title'), 6000, 100)
    return evalIn(`(()=>{const i=document.querySelector('.page .title'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(t)}); i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`)
  },
  addChild: async t => {
    await waitFor(() => evalIn(`!!(${rowExpr(t)})`), 6000, 100)
    await evalIn(`${rowExpr(t)}.querySelector('button.mini').click(); true`)
    return !!(await waitFor(() => has('.page .title'), 6000, 100))
  },
  del: async () => {
    await waitFor(() => evalIn(`!![...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Delete')`), 6000, 100)
    return evalIn(`(()=>{window.confirm=()=>true; [...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Delete').click(); return true})()`)
  },
}
const ATTACH = `(async () => {
  const { db } = await import('/src/data/db.ts')
  const sync = await import('/src/data/folderSync.ts')
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('nb', { create: true })
  await db.handles.put({ key: 'notebook', id: 'opfs-test-folder', name: 'nb', handle: dir })
  await sync.startFolderSync()
  return true
})()`

const status = () => evalIn(`import('/src/data/folderSync.ts').then(m => 0)`).then(() => null)

try {
  await startVite()
  await launch()
  await evalIn(HELPERS)

  check('0  browser mode in effect (no desktop bridge, FSA available)',
    await evalIn(`!window.npknDesktop?.notebook && typeof window.showDirectoryPicker === 'function'`))
  await waitFor(() => evalIn(`!!document.querySelector('aside')`))
  await sleep(1500) // let the Welcome page seed

  await evalIn(ATTACH)

  // A. attaching a folder writes existing pages out
  check('A1 welcome.md written', await waitFor(async () => nb.exists('welcome.md')))
  const w = (await nb.exists('welcome.md')) ? await nb.read('welcome.md') : ''
  check('A2 file has id, type, title', /^---\nid: "welcome"\n/.test(w) && /type: guide/.test(w) && /title: "Welcome"/.test(w), w.slice(0, 120))
  check('A3 id hidden from in-app properties', !((await pages()).find(p => p.id === 'welcome')?.fm ?? '').includes('id:'))

  // B. external edit
  await nb.write('welcome.md', (await nb.read('welcome.md')) + '\nEXTERNAL-EDIT-MARKER\n')
  check('B  external edit imported (found by polling)', await waitFor(async () => (await pages()).find(p => p.id === 'welcome')?.text.includes('EXTERNAL-EDIT-MARKER'), 12000))

  // C. hand-written file
  await nb.write('hand-made.md', '# Hand made\n\n* star bullet\n* second\n')
  check('C1 hand-written file imported', await waitFor(async () => (await pages()).some(p => p.title === 'Hand made'), 12000))
  await waitFor(async () => /^---\nid: "/.test(await nb.read('hand-made.md')))
  const hm = await nb.read('hand-made.md')
  check('C2 file gained only an id line', /^---\nid: "[0-9a-f-]{36}"\n---\n/.test(hm), hm.slice(0, 80))
  check('C3 body not reformatted', hm.includes('* star bullet\n* second'), hm)

  // D. app edit -> disk
  await ui.open('Hand made'); await sleep(500)
  await ui.type(' APPENDED-IN-APP')
  check('D  app edit written to file', await waitFor(async () => (await nb.read('hand-made.md')).includes('APPENDED-IN-APP')))

  // E. rename
  await ui.title('Renamed Page')
  check('E1 file renamed (copy then delete)', await waitFor(async () => (await nb.exists('renamed-page.md')) && !(await nb.exists('hand-made.md'))), (await nb.list()).join(', '))
  check('E2 content survived rename', (await nb.exists('renamed-page.md')) && (await nb.read('renamed-page.md')).includes('APPENDED-IN-APP'))
  check('E3 title in file updated', (await nb.exists('renamed-page.md')) && /title: "Renamed Page"/.test(await nb.read('renamed-page.md')))

  // F. hierarchy
  await ui.addChild('Renamed Page'); await sleep(900)
  await ui.title('Child Note')
  check('F1 child under parent folder', await waitFor(() => nb.exists('renamed-page/child-note.md')), (await nb.list()).join(', '))
  await ui.open('Renamed Page'); await sleep(400)
  await ui.title('Parent Moved')
  check('F2 parent renamed', await waitFor(async () => (await nb.exists('parent-moved.md')) && !(await nb.exists('renamed-page.md'))), (await nb.list()).join(', '))
  check('F3 child followed, old folder pruned', await waitFor(async () => (await nb.exists('parent-moved/child-note.md')) && !(await nb.list()).some(f => f.startsWith('renamed-page'))), (await nb.list()).join(', '))
  check('F4 child still linked in app', (await pages()).find(p => p.title === 'Child Note')?.parentId === (await pages()).find(p => p.title === 'Parent Moved')?.id)

  // G. delete -> trash
  await ui.open('Child Note'); await sleep(400); await ui.del()
  check('G1 child gone from folder', await waitFor(async () => !(await nb.exists('parent-moved/child-note.md'))))
  check('G2 child kept in .trash', (await nb.list()).some(f => /^\.trash\/.*child-note\.md$/.test(f)), (await nb.list()).join(', '))

  // H. external delete
  await nb.remove('welcome.md')
  check('H  externally deleted file removes page', await waitFor(async () => !(await pages()).some(p => p.id === 'welcome'), 12000))

  // I. conflict
  await ui.open('Parent Moved'); await sleep(500)
  await ui.type(' APP-SIDE-CONFLICT')
  await nb.write('parent-moved.md', (await nb.read('parent-moved.md')).replace('APPENDED-IN-APP', 'DISK-SIDE-CONFLICT'))
  const conflict = await waitFor(async () => (await nb.list()).find(f => /conflict-/.test(f)), 12000)
  check('I1 conflict copy kept', !!conflict, (await nb.list()).join(', '))
  check('I2 conflict copy holds the disk version', !!conflict && (await nb.read(conflict)).includes('DISK-SIDE-CONFLICT'))
  check('I3 app version won on main file', await waitFor(async () => (await nb.read('parent-moved.md')).includes('APP-SIDE-CONFLICT')))
  await sleep(4000)
  check('I4 exactly one conflict copy', (await nb.list()).filter(f => /conflict-/.test(f)).length === 1, (await nb.list()).join(', '))

  // J. reload: handle + bookkeeping persist, nothing rewritten, nothing duplicated
  const before = await nb.mtimes()
  const count = (await pages()).length
  await reloaded()
  await evalIn(HELPERS)
  await sleep(4500)
  const after = await nb.mtimes()
  check('J1 same files after reload', JSON.stringify(Object.keys(before).sort()) === JSON.stringify(Object.keys(after).sort()), `${Object.keys(before)} vs ${Object.keys(after)}`)
  check('J2 no file rewritten on reload', Object.keys(before).every(f => before[f] === after[f]), Object.keys(before).filter(f => before[f] !== after[f]).join(','))
  check('J3 same page count after reload', (await pages()).length === count, `${count} -> ${(await pages()).length}`)
  check('J4 folder still attached after reload (handle remembered)', await evalIn(`new Promise(r=>{const q=indexedDB.open('notes'); q.onsuccess=()=>{const g=q.result.transaction('handles').objectStore('handles').count(); g.onsuccess=()=>r(g.result===1)}})`))

  // K. wiping the browser database must not touch the folder; re-attaching rebuilds
  const trashBefore = (await nb.list()).filter(f => f.startsWith('.trash/')).length
  const filesBefore = (await nb.list()).filter(f => !f.startsWith('.')).length
  await evalIn(`new Promise(r=>{const q=indexedDB.deleteDatabase('notes'); q.onsuccess=()=>r(true); q.onblocked=()=>r('blocked'); q.onerror=()=>r(false)})`)
  await reloaded()
  await evalIn(HELPERS)
  await sleep(2500)
  check('K1 files untouched by the wipe', (await nb.list()).filter(f => !f.startsWith('.')).length === filesBefore, (await nb.list()).join(', '))
  await evalIn(ATTACH)
  await sleep(4500)
  check('K2 pages rebuilt from the folder', (await pages()).some(p => p.title === 'Parent Moved'), JSON.stringify((await pages()).map(p => p.title)))
  check('K3 nothing extra trashed', (await nb.list()).filter(f => f.startsWith('.trash/')).length === trashBefore, (await nb.list()).join(', '))

  // L. permission lapses (what a real reload usually does): nothing may be read or written until the
  //    user clicks Reconnect.
  await evalIn(`(() => {
    const p = FileSystemDirectoryHandle.prototype
    p.queryPermission = async () => 'prompt'
    p.requestPermission = async () => { p.queryPermission = async () => 'granted'; return 'granted' }
    return true
  })()`)
  await evalIn(`import('/src/data/folderSync.ts').then(m => m.startFolderSync())`)
  const label = () => evalIn(`document.querySelector('.nf-status')?.textContent ?? ''`)
  check('L1 lapsed permission is shown', await waitFor(async () => /re-granted/.test(await label())), await label())
  check('L2 Reconnect is offered', await evalIn(`[...document.querySelectorAll('.nf-actions button')].some(b => b.textContent === 'Reconnect')`))
  await nb.write('while-locked.md', '# While locked\n\nwritten while access was lapsed\n')
  await sleep(4500)
  check('L3 nothing imported while locked', !(await pages()).some(p => p.title === 'While locked'))
  await evalIn(`[...document.querySelectorAll('.nf-actions button')].find(b => b.textContent === 'Reconnect').click()`)
  check('L4 reconnect resumes sync and picks up what changed', await waitFor(async () => (await pages()).some(p => p.title === 'While locked'), 12000))
  check('L5 status back to in sync', await waitFor(async () => /In sync/.test(await label()), 8000), await label())

  // M. links between pages travel through files as ordinary relative markdown links
  await nb.write('link-b.md', '---\ntype: note\n---\n\n# Link B\n\nTarget page.\n')
  await nb.write('link-a.md', '# Link A\n\nSee [the B page](link-b.md) and [the web](https://example.com/x).\n')
  check('M1 both files imported', await waitFor(async () => { const ps = await pages(); return ps.some(p => p.title === 'Link A') && ps.some(p => p.title === 'Link B') }, 14000))
  const idOf = async t => (await pages()).find(p => p.title === t)?.id
  const textOf = async t => (await pages()).find(p => p.title === t)?.text ?? ''
  const bId = await idOf('Link B')
  check('M2 relative link resolved to the page id', await waitFor(async () => (await textOf('Link A')).includes('npkn:' + bId), 10000), (await textOf('Link A')).slice(0, 200))
  check('M3 web link left alone', (await textOf('Link A')).includes('https://example.com/x'))

  // Renaming the target rewrites the linking file even though that page was never edited.
  await ui.open('Link B'); await sleep(500)
  await ui.title('Link B Renamed')
  check('M4 target file renamed', await waitFor(() => nb.exists('link-b-renamed.md')), '')
  const aFile = async () => nb.read('link-a.md')
  check('M5 linking file rewritten to the new path', await waitFor(async () => (await aFile()).includes('(link-b-renamed.md)'), 12000), await aFile())
  check('M6 no private scheme ever reaches a file', !(await aFile()).includes('npkn:'))
  check('M7 the in-app link still points at the same page', (await textOf('Link A')).includes('npkn:' + bId))

  // A child page linking up the tree resolves relative to its own folder.
  await nb.write('link-b-renamed/kid.md', '# Kid\n\nBack to [A](../link-a.md).\n')
  check('M8 nested relative link resolves', await waitFor(async () => (await textOf('Kid')).includes('npkn:' + (await idOf('Link A'))), 14000), await textOf('Kid'))

  // A link whose target arrives later is retried and resolves once it exists.
  await nb.write('late-linker.md', '# Late linker\n\n[soon](late-target.md)\n')
  check('M9 unresolved link kept as written', await waitFor(async () => (await textOf('Late linker')).includes('late-target.md'), 12000))
  await nb.write('late-target.md', '# Late target\n\nHere now.\n')
  check('M10 resolves when the target appears', await waitFor(async () => { const id = await idOf('Late target'); return id && (await textOf('Late linker')).includes('npkn:' + id) }, 14000), await textOf('Late linker'))

  // Deleting the target must not corrupt the linking page: the link is kept (marked broken in the editor).
  await ui.open('Late target'); await sleep(500); await ui.del()
  check('M11 linking page survives its target being deleted', await waitFor(async () => !(await pages()).some(p => p.title === 'Late target')) && (await pages()).some(p => p.title === 'Late linker'))
} catch (e) {
  fail++; console.log('ERROR', e.stack ?? e)
} finally {
  try { ws?.close() } catch {}
  proc?.kill('SIGTERM')
  vite?.kill('SIGTERM')
  await sleep(800)
  console.log(`\n${pass} passed, ${fail} failed`)
  fs.rmSync(UD, { recursive: true, force: true })
  process.exit(fail ? 1 : 0)
}
