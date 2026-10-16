import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// End-to-end test of notebook-folder sync. Drives the real desktop app over the Chrome DevTools
// protocol against a throwaway notebook folder and a throwaway profile (so it can't touch real data).
// Needs a current build: run `npm run build` first, or just `npm run test:desktop`.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ELECTRON = `${REPO}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`
const NB = fs.mkdtempSync(path.join(os.tmpdir(), 'npkn-nb-'))
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'npkn-ud-'))
const PORT = 9444
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '   <- ' + detail}`) }

let proc, ws, id = 0
const pending = new Map()

async function launch() {
  proc = spawn(ELECTRON, [`--remote-debugging-port=${PORT}`, `${REPO}/desktop/main.cjs`], {
    env: { ...process.env, NPKN_NOTEBOOK: NB, NPKN_USER_DATA: UD }, stdio: 'ignore',
  })
  let target
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page' && t.url.startsWith('app://')) } catch {}
  }
  if (!target) throw new Error('app did not start')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => (ws.onopen = r))
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  await sleep(1500)
}
async function quit() { try { ws.close() } catch {} proc.kill('SIGTERM'); await sleep(1200) }

const evalIn = async expression => {
  const r = await new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })) })
  if (r.result?.exceptionDetails) throw new Error('page error: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result.result.value
}
const waitFor = async (fn, ms = 8000, step = 250) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return false; await sleep(step) } }

const files = (dir = NB, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(e => e.name.startsWith('.') ? [] : e.isDirectory() ? files(dir, path.join(rel, e.name)) : [path.join(rel, e.name)])
const read = rel => fs.readFileSync(path.join(NB, rel), 'utf8')
const exists = rel => fs.existsSync(path.join(NB, rel))
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

try {
  console.log('notebook:', NB)
  await launch()

  // A. first launch writes the seeded Welcome page to the folder
  check('A1 welcome.md written', await waitFor(() => exists('welcome.md')))
  const w = exists('welcome.md') ? read('welcome.md') : ''
  check('A2 file has id, type, title', /^---\nid: "welcome"\n/.test(w) && /type: guide/.test(w) && /title: "Welcome"/.test(w), w.slice(0, 160))
  check('A3 id is hidden from in-app properties', !((await pages()).find(p => p.id === 'welcome')?.fm ?? '').includes('id:'))

  // B. external edit shows up in the app
  fs.writeFileSync(path.join(NB, 'welcome.md'), read('welcome.md') + '\nEXTERNAL-EDIT-MARKER\n')
  check('B  external edit imported', await waitFor(async () => (await pages()).find(p => p.id === 'welcome')?.text.includes('EXTERNAL-EDIT-MARKER')))

  // C. a hand-written file appears, gains only an id line, body untouched
  fs.writeFileSync(path.join(NB, 'hand-made.md'), '# Hand made\n\n* star bullet\n* second\n')
  check('C1 hand-written file imported', await waitFor(async () => (await pages()).some(p => p.title === 'Hand made')))
  await waitFor(() => /^---\nid: "/.test(read('hand-made.md')))
  const hm = read('hand-made.md')
  check('C2 file gained an id line', /^---\nid: "[0-9a-f-]{36}"\n---\n/.test(hm), hm.slice(0, 80))
  check('C3 body not reformatted', hm.includes('* star bullet\n* second'), hm)

  // D. editing in the app writes to disk
  await ui.open('Hand made'); await sleep(500)
  await ui.type(' APPENDED-IN-APP')
  check('D  app edit written to file', await waitFor(() => read('hand-made.md').includes('APPENDED-IN-APP')))

  // E. renaming the title renames the file; no duplicate left behind
  await ui.title('Renamed Page')
  check('E1 file renamed', await waitFor(() => exists('renamed-page.md') && !exists('hand-made.md')), files().join(', '))
  check('E2 content survived rename', exists('renamed-page.md') && read('renamed-page.md').includes('APPENDED-IN-APP'))
  check('E3 title in file updated', exists('renamed-page.md') && /title: "Renamed Page"/.test(read('renamed-page.md')))

  // F. hierarchy: child lands in a folder named for its parent; renaming the parent moves it
  await ui.addChild('Renamed Page'); await sleep(900)
  await ui.title('Child Note')
  check('F1 child written under parent folder', await waitFor(() => exists('renamed-page/child-note.md')), files().join(', '))
  await ui.open('Renamed Page'); await sleep(400)
  await ui.title('Parent Moved')
  check('F2 parent renamed', await waitFor(() => exists('parent-moved.md') && !exists('renamed-page.md')), files().join(', '))
  check('F3 child followed parent', await waitFor(() => exists('parent-moved/child-note.md') && !exists('renamed-page/child-note.md')), files().join(', '))
  check('F4 child parent link kept in app', (await pages()).find(p => p.title === 'Child Note')?.parentId === (await pages()).find(p => p.title === 'Parent Moved')?.id)

  // G. deleting in the app trashes the file, never unlinks
  await ui.open('Child Note'); await sleep(400); await ui.del()
  check('G1 child gone from folder', await waitFor(() => !exists('parent-moved/child-note.md')))
  const trash = fs.existsSync(path.join(NB, '.trash')) ? fs.readdirSync(path.join(NB, '.trash')) : []
  check('G2 child kept in .trash', trash.some(n => n.endsWith('child-note.md')), trash.join(','))

  // H. external delete removes the page
  fs.rmSync(path.join(NB, 'welcome.md'))
  check('H  externally deleted file removes page', await waitFor(async () => !(await pages()).some(p => p.id === 'welcome')))

  // I. conflict: edit in app and on disk inside the same sync window
  await ui.open('Parent Moved'); await sleep(300)
  await ui.type(' APP-SIDE-CONFLICT')
  fs.writeFileSync(path.join(NB, 'parent-moved.md'), read('parent-moved.md').trimEnd() + '\n\nDISK-SIDE-CONFLICT\n')
  const conflict = await waitFor(() => files().find(f => /conflict-/.test(f)), 9000)
  check('I1 conflict copy kept', !!conflict, files().join(', '))
  check('I2 conflict copy holds the disk version', !!conflict && read(conflict).includes('DISK-SIDE-CONFLICT'))
  check('I3 app version won on the main file', await waitFor(() => exists('parent-moved.md') && read('parent-moved.md').includes('APP-SIDE-CONFLICT')))

  // J. restart: nothing duplicated, nothing rewritten
  await sleep(2500)
  const before = Object.fromEntries(files().map(f => [f, fs.statSync(path.join(NB, f)).mtimeMs]))
  const countBefore = (await pages()).length
  await quit(); await launch(); await sleep(3500)
  const after = Object.fromEntries(files().map(f => [f, fs.statSync(path.join(NB, f)).mtimeMs]))
  check('J1 same files after restart', JSON.stringify(Object.keys(before).sort()) === JSON.stringify(Object.keys(after).sort()), `${Object.keys(before)} vs ${Object.keys(after)}`)
  check('J2 no file rewritten on restart', Object.keys(before).every(f => before[f] === after[f]), Object.keys(before).filter(f => before[f] !== after[f]).join(','))
  check('J3 same page count after restart', (await pages()).length === countBefore, `${countBefore} -> ${(await pages()).length}`)

  // K. wiping the app's database must not trash the files
  await evalIn(`new Promise(r=>{const q=indexedDB.deleteDatabase('notes'); q.onsuccess=()=>r(true); q.onblocked=()=>r('blocked'); q.onerror=()=>r(false)})`)
  await quit(); await launch(); await sleep(4000)
  check('K1 files survive an app-database wipe', files().length === Object.keys(after).length, files().join(', '))
  check('K2 pages are rebuilt from the folder', (await pages()).some(p => p.title === 'Parent Moved'))
  const trash2 = fs.existsSync(path.join(NB, '.trash')) ? fs.readdirSync(path.join(NB, '.trash')) : []
  check('K3 nothing extra trashed', trash2.length === trash.length, trash2.join(','))
  const writeNb = async (rel, text) => { fs.mkdirSync(path.dirname(path.join(NB, rel)), { recursive: true }); fs.writeFileSync(path.join(NB, rel), text) }

  // L. links between pages travel through files as ordinary relative markdown links
  await writeNb('link-b.md', '---\ntype: note\n---\n\n# Link B\n\nTarget page.\n')
  await writeNb('link-a.md', '# Link A\n\nSee [the B page](link-b.md) and [the web](https://example.com/x).\n')
  check('L1 both files imported', await waitFor(async () => { const ps = await pages(); return ps.some(p => p.title === 'Link A') && ps.some(p => p.title === 'Link B') }, 14000))
  const idOf = async t => (await pages()).find(p => p.title === t)?.id
  const textOf = async t => (await pages()).find(p => p.title === t)?.text ?? ''
  const bId = await idOf('Link B')
  check('L2 relative link resolved to the page id', await waitFor(async () => (await textOf('Link A')).includes('npkn:' + bId), 10000), (await textOf('Link A')).slice(0, 200))
  check('L3 web link left alone', (await textOf('Link A')).includes('https://example.com/x'))

  // Renaming the target rewrites the linking file even though that page was never edited.
  await ui.open('Link B'); await sleep(500)
  await ui.title('Link B Renamed')
  check('L4 target file renamed', await waitFor(() => exists('link-b-renamed.md'), 15000), files().join(', '))
  const aFile = async () => read('link-a.md')
  check('L5 linking file rewritten to the new path', await waitFor(async () => (await aFile()).includes('(link-b-renamed.md)'), 12000), await aFile())
  check('L6 no private scheme ever reaches a file', !(await aFile()).includes('npkn:'))
  check('L7 the in-app link still points at the same page', (await textOf('Link A')).includes('npkn:' + bId))

  // A child page linking up the tree resolves relative to its own folder.
  await writeNb('link-b-renamed/kid.md', '# Kid\n\nBack to [A](../link-a.md).\n')
  check('L8 nested relative link resolves', await waitFor(async () => (await textOf('Kid')).includes('npkn:' + (await idOf('Link A'))), 14000), await textOf('Kid'))

  // A link whose target arrives later is retried and resolves once it exists.
  await writeNb('late-linker.md', '# Late linker\n\n[soon](late-target.md)\n')
  check('L9 unresolved link kept as written', await waitFor(async () => (await textOf('Late linker')).includes('late-target.md'), 12000))
  await writeNb('late-target.md', '# Late target\n\nHere now.\n')
  check('L10 resolves when the target appears', await waitFor(async () => { const id = await idOf('Late target'); return id && (await textOf('Late linker')).includes('npkn:' + id) }, 14000), await textOf('Late linker'))

  // Deleting the target must not corrupt the linking page: the link is kept (marked broken in the editor).
  await ui.open('Late target'); await sleep(500); await ui.del()
  check('L11 linking page survives its target being deleted', await waitFor(async () => !(await pages()).some(p => p.title === 'Late target')) && (await pages()).some(p => p.title === 'Late linker'))
} catch (e) {
  fail++; console.log('ERROR', e.stack ?? e)
} finally {
  await quit()
  console.log(`\n${pass} passed, ${fail} failed`)
  console.log('final files:', files().join(', '))
  fs.rmSync(NB, { recursive: true, force: true }); fs.rmSync(UD, { recursive: true, force: true })
  process.exit(fail ? 1 : 0)
}
