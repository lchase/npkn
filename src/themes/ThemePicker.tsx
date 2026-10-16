import { useRef, useState } from 'react'
import { allThemes, importTheme, oppositeThemeId, selectTheme, selectedThemeId } from './index'

/** Plain labels for the two defaults so "Light" and "Dark" are obvious, then everything else. */
const LABEL: Record<string, string> = { paper: 'Light (Paper)', ink: 'Dark (Ink)' }

export function ThemePicker() {
  const [sel, setSel] = useState(selectedThemeId())
  const [, bump] = useState(0)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const choose = (id: string) => {
    setSel(id)
    selectTheme(id)
  }

  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const t = importTheme(JSON.parse(await f.text()))
      setError('')
      bump(n => n + 1)
      choose(t.id)
    } catch (e) {
      setError((e as Error).message)
    }
    if (file.current) file.current.value = ''
  }

  const themes = allThemes()
  const core = ['paper', 'ink'].map(id => themes.find(t => t.id === id)!).filter(Boolean)
  const more = themes.filter(t => !LABEL[t.id])

  return (
    <div className="theme-picker">
      <label>
        Theme
        <span className="theme-row">
          <select value={sel} onChange={e => choose(e.target.value)}>
            <option value="auto">Auto (system)</option>
            {core.map(t => (
              <option key={t.id} value={t.id}>
                {LABEL[t.id]}
              </option>
            ))}
            <optgroup label="More themes">
              {more.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            type="button"
            className="theme-flip"
            title="Flip light / dark (stays in the same theme family when it has one)"
            onClick={() => choose(oppositeThemeId(sel))}
          >
            ◐
          </button>
        </span>
      </label>
      <button className="linklike" onClick={() => file.current?.click()}>Import theme…</button>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
      {error && <p className="theme-error">{error}</p>}
    </div>
  )
}
