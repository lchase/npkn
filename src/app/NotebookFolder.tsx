import { FolderIcon, StopIcon } from '../ui/icons'
import { pickNotebookFolder, reconnectNotebookFolder, stopUsingNotebookFolder, useNotebookFolder, useSyncStatus } from '../data/folderSync'

const tail = (p: string) => p.split('/').filter(Boolean).slice(-2).join('/')

const BROWSER_NOTE =
  '• The browser will ask to keep access to the folder. It may ask again after a reload.\n'

/** One-line sync status at the foot of the sidebar; details and actions open in a small popover. */
export function NotebookFolder() {
  const s = useSyncStatus()
  if (s.state === 'unsupported') return null

  // Browser mode: showDirectoryPicker only works straight from a click, so this runs in the handler.
  const choose = async () => {
    const dir = await pickNotebookFolder()
    if (!dir) return
    const ok = confirm(
      `Use "${dir}" as the notebook folder?\n\n` +
        (s.mode === 'browser' ? BROWSER_NOTE : '') +
        '• Pages in this app are written there as .md files.\n' +
        '• Any .md files already in it are added to the app.\n' +
        '• Deleted pages go to a .trash folder, not the bin.\n\n' +
        'If a page exists in both places, the file in the folder wins.',
    )
    if (ok) await useNotebookFolder(dir)
  }

  if (!s.root)
    return (
      <button className="nf-connect" title="Keep the notebook as .md files in a folder" onClick={choose}>
        <FolderIcon size={13} /> Connect folder
      </button>
    )

  const label =
    s.state === 'error'
      ? `Sync problem: ${s.message ?? 'unknown'}`
      : s.state === 'needs-permission'
        ? 'Access needs to be re-granted'
        : s.state === 'syncing'
          ? 'Syncing…'
          : 'In sync'
  const time = s.at && new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // ponytail: native <details> as the popover; it closes on its own summary, not on outside clicks.
  return (
    <div className="notebook-folder">
      <details className="nf-details">
        <summary className={'nf-bar ' + s.state} title={label}>
          <span className="nf-path">{tail(s.root)}</span>
          {time && s.state === 'idle' && <span className="nf-time">{time}</span>}
        </summary>
        <div className="nf-pop">
          <div className={'nf-status ' + s.state}>{label}</div>
          <div className="nf-root" title={s.root}>{s.root}</div>
          {time && <div className="nf-root">Last synced {time}</div>}
          <button className="nf-opt" onClick={choose}>
            <FolderIcon size={13} /> Change folder…
          </button>
          <button
            className="nf-opt"
            onClick={() => confirm('Stop syncing? Files stay in the folder and pages stay in the app.') && stopUsingNotebookFolder()}
          >
            <StopIcon size={13} /> Stop syncing
          </button>
        </div>
      </details>
      {s.state === 'needs-permission' && (
        <div className="nf-actions">
          <button className="dock-btn" onClick={() => void reconnectNotebookFolder()}>
            Reconnect
          </button>
        </div>
      )}
    </div>
  )
}
