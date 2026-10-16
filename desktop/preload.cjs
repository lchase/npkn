// Runs in an isolated context. The renderer gets a flag and a narrow notebook-folder API, nothing else.
const { contextBridge, ipcRenderer } = require('electron')

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

const noNotebook = process.argv.includes('--npkn-no-notebook')

contextBridge.exposeInMainWorld('npknDesktop', {
  platform: process.platform,
  notebook: noNotebook ? undefined : {
    get: () => call('notebook:get'),
    choose: () => call('notebook:choose'),
    set: dir => call('notebook:set', dir),
    clear: () => call('notebook:clear'),
    scan: known => call('notebook:scan', known),
    write: (rel, text, opts) => call('notebook:write', rel, text, opts),
    move: (from, to) => call('notebook:move', from, to),
    trash: rel => call('notebook:trash', rel),
    onChange: cb => {
      const handler = () => cb()
      ipcRenderer.on('notebook:changed', handler)
      return () => ipcRenderer.removeListener('notebook:changed', handler)
    },
  },
})
