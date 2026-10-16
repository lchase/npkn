import { FolderIcon, StopIcon } from '../ui/icons'
import { pickNotebookFolder, reconnectNotebookFolder, stopUsingNotebookFolder, useNotebookFolder, useSyncStatus } from '../data/folderSync'

const tail = (p: string) => p.split('/').filter(Boolean).slice(-2).join('/')

const BROWSER_NOTE =
  '• The browser will ask to keep access to the folder. It may ask again after a reload.\n'

/** Pick the folder that holds the notebook as plain .md files (desktop app, or a Chromium browser). */
export function NotebookFolder() {
  const s = useSyncStatus()
  if (s.state === 'unsupported') return null

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

  const label =
    s.state === 'error'
      ? `Sync problem: ${s.message ?? 'unknown'}`
      : s.state === 'needs-permission'
        ? 'Access needs to be re-granted'
        : s.state === 'syncing'
          ? 'Syncing…'
          : s.root
            ? 'In sync'
            : s.mode === 'browser'
              ? 'Stored in this browser only'
              : 'Stored in this app only'

  return (
    <div className="notebook-folder">
      <div className="nf-head">
        <div className="nf-names">
          <div className="nf-path" title={s.root ?? undefined}>
            {s.root ? tail(s.root) : 'Notebook'}
          </div>
          <div className="nf-title">Notebook folder</div>
        </div>
        <div className="nf-icons">
          <button className="icon-btn" title={s.root ? 'Change folder…' : 'Choose folder…'} aria-label={s.root ? 'Change folder' : 'Choose folder'} onClick={choose}>
            <FolderIcon />
          </button>
          {s.root && (
            <button
              className="icon-btn"
              title="Stop syncing"
              aria-label="Stop syncing"
              onClick={() => confirm('Stop syncing? Files stay in the folder and pages stay in the app.') && stopUsingNotebookFolder()}
            >
              <StopIcon />
            </button>
          )}
        </div>
      </div>
      <div className={'nf-status ' + s.state}>{label}</div>
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
