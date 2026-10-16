import { useRef, useState } from 'react'
import { AutoIcon, MoonIcon, PaletteIcon, SunIcon } from '../ui/icons'
import { allThemes, importTheme, selectTheme, selectedThemeId } from './index'

/** The two defaults plus Auto get one-click buttons; every other theme lives behind the palette button. */
const CORE = new Set(['paper', 'ink'])

export function ThemePicker() {
  const [sel, setSel] = useState(selectedThemeId())
  const [, bump] = useState(0)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
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
  const more = themes.filter(t => !CORE.has(t.id))
  const onMore = sel !== 'auto' && !CORE.has(sel)
  const seg = (id: string, label: string, icon: React.ReactNode) => (
    <button type="button" className={'seg' + (sel === id ? ' on' : '')} aria-pressed={sel === id} onClick={() => choose(id)}>
      {icon} {label}
    </button>
  )

  return (
    <div className="theme-picker">
      <div className="theme-row">
        <div className="segmented" role="group" aria-label="Theme">
          {seg('ink', 'Dark', <MoonIcon size={14} />)}
          {seg('paper', 'Paper', <SunIcon size={14} />)}
          {seg('auto', 'Auto', <AutoIcon size={14} />)}
        </div>
        <button
          type="button"
          className={'icon-btn' + (open || onMore ? ' on' : '')}
          title="More themes"
          aria-label="More themes"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <PaletteIcon />
        </button>
      </div>
      {open && (
        <div className="theme-more">
          {more.map(t => (
            <button key={t.id} type="button" className={'theme-opt' + (sel === t.id ? ' on' : '')} onClick={() => choose(t.id)}>
              {t.name}
            </button>
          ))}
          <button type="button" className="theme-opt" onClick={() => file.current?.click()}>
            Import theme…
          </button>
        </div>
      )}
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
      {error && <p className="theme-error">{error}</p>}
    </div>
  )
}
