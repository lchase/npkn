/**
 * What the sync engine needs from wherever the notebook folder lives. Two implementations:
 * the Electron preload (real paths, Node fs) and the browser (File System Access API).
 */
export interface NotebookBridge {
  /** `id` identifies the folder across sessions when the display name isn't unique (browser). */
  get(): Promise<{ root: string | null; id?: string; needsPermission?: boolean }>
  choose(): Promise<{ root: string } | null>
  set(dir: string): Promise<{ root: string }>
  clear(): Promise<{ root: null }>
  scan(known: Record<string, number>): Promise<{ root: string | null; files: { path: string; mtimeMs: number; text?: string }[] }>
  write(path: string, text: string, opts?: { expect?: number | null }): Promise<{ mtimeMs: number }>
  /** Resolves to the moved file's mtime (a copy-based move changes it), or null if there was nothing to move. */
  move(from: string, to: string): Promise<{ mtimeMs: number } | null>
  trash(path: string): Promise<boolean>
  onChange(cb: () => void): () => void
  /** Browser only: re-grant access to the remembered folder. Must be called from a user gesture. */
  reconnect?(): Promise<boolean>
}

declare global {
  interface Window {
    npknDesktop?: { platform: string; notebook: NotebookBridge }
  }
}
