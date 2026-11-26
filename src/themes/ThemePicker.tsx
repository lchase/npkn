import { useRef, useState, type CSSProperties } from 'react'
import { hueFor } from '../editor/chip'
import { AutoIcon } from '../ui/icons'
import { allThemes, importTheme, selectTheme, selectedThemeId, themeStyle } from './index'

/** Theme list for Settings > Display. Hovering or focusing a theme previews it in the sample page only. */
export function ThemePicker() {
  const [sel, setSel] = useState(selectedThemeId())
  const [hover, setHover] = useState<string | null>(null)
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

  const option = (id: string, label: React.ReactNode) => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={sel === id}
      className={'theme-opt' + (sel === id ? ' on' : '')}
      onClick={() => choose(id)}
      onMouseEnter={() => setHover(id)}
      onFocus={() => setHover(id)}
    >
      <span className="theme-swatch" style={themeStyle(id) as CSSProperties} aria-hidden>
        <i />
      </span>
      {label}
    </button>
  )

  return (
    <div className="theme-settings">
      <div className="theme-list" role="radiogroup" aria-label="Theme" onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}>
        {option(
          'auto',
          <>
            Auto <AutoIcon size={13} />
          </>,
        )}
        {allThemes().map(t => option(t.id, t.name))}
        <button type="button" className="theme-opt theme-import" onClick={() => file.current?.click()}>
          Import theme…
        </button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
        {error && <p className="theme-error">{error}</p>}
      </div>
      <ThemePreview style={hover ? (themeStyle(hover) as CSSProperties) : undefined} />
    </div>
  )
}

/** Static sample page using the editor's own class names, so it renders exactly as notes do. */
function ThemePreview({ style }: { style?: CSSProperties }) {
  return (
    <div className="theme-preview editor" style={style} aria-label="Theme preview">
      <div className="title">Weekly review</div>
      <h2>Plans</h2>
      <p>
        Ship the <strong>sync fix</strong>, then <em>tidy</em> the <code>folderSync</code> notes. See the{' '}
        <a href="#preview" onClick={e => e.preventDefault()}>
          release checklist
        </a>
        .
      </p>
      <ul data-type="taskList">
        <li data-checked="true">
          <label>
            <input type="checkbox" checked readOnly tabIndex={-1} />
          </label>
          <div>
            <p>Draft the changelog</p>
          </div>
        </li>
        <li data-checked="false">
          <label>
            <input type="checkbox" readOnly tabIndex={-1} />
          </label>
          <div>
            <p>
              Review the PR <span className="chip chip-date">Fri</span>
              <span className="chip chip-category" data-label="doing" style={{ ['--h' as string]: hueFor('doing') } as CSSProperties}>
                doing
              </span>
            </p>
          </div>
        </li>
      </ul>
      <div className="codeblock">
        <pre>
          <code>
            <span className="hljs-keyword">const</span> <span className="hljs-variable">due</span> ={' '}
            <span className="hljs-title function_">nextFriday</span>(<span className="hljs-number">1</span>){' '}
            <span className="hljs-comment">// "@fri"</span>
          </code>
        </pre>
      </div>
      <table>
        <tbody>
          <tr>
            <th>Task</th>
            <th>Owner</th>
          </tr>
          <tr>
            <td>Sync fix</td>
            <td>Sam</td>
          </tr>
        </tbody>
      </table>
      <blockquote>
        <p>Small steps, shipped often.</p>
      </blockquote>
    </div>
  )
}
