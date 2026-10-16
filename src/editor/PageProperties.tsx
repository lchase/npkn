import { useState } from 'react'
import type { Page } from '../core/types'
import { updatePage } from '../data/pages'
import { NEW_FRONT, frontTags, frontText, frontType, isFlaggedPrivate, parseFront } from '../core/frontmatter'
import { addYamlKey, renameYamlKey, stripYamlKey, upsertYamlKey } from '../core/notefile'
import { KNOWN_KEYS, TYPE_IDEAS, keyHints } from '../core/propertyKeys'
import { LockIcon } from '../ui/icons'

/**
 * Page properties (OKF front matter). Collapsed to a muted one-line summary; click to edit the YAML.
 */
export function PageProperties({ page, inheritedPrivate = false }: { page: Page; inheritedPrivate?: boolean }) {
  const [text, setText] = useState(page.frontmatter ?? '')
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState('')

  const save = (next: string) => {
    setText(next)
    updatePage(page.id, { frontmatter: next.trim() ? next : undefined })
  }

  const parsed = parseFront(text)
  const flagged = isFlaggedPrivate(text)
  const isPrivate = flagged || inheritedPrivate
  const setPrivate = (on: boolean) => save(on ? upsertYamlKey(text.trim() ? text : 'type: note\n', 'private', 'true') : stripYamlKey(text, 'private'))

  if (!parsed && !open) {
    return (
      <div className={'fm fm-empty' + (inheritedPrivate ? ' fm-pinned' : '')}>
        {inheritedPrivate && <span className="fm-lock"><LockIcon /> private (inherited)</span>}
        <button className="linklike" onClick={() => (save(NEW_FRONT(page.title)), setOpen(true))}>
          + Properties
        </button>
      </div>
    )
  }

  const type = frontType(parsed)
  const data = parsed?.ok ? parsed.data : null
  const tags = data ? frontTags(data) : []
  const desc = data ? frontText(data, 'description') : ''
  const extra = data ? Object.keys(data).filter(k => !['type', 'title', 'description', 'tags'].includes(k)).length : 0
  const present = new Set(data ? Object.keys(data) : [])
  const hints = data ? keyHints([...present]) : []
  const offered = KNOWN_KEYS.filter(k => k.offer && !present.has(k.key))

  return (
    <div className={'fm' + (open ? ' open' : '')}>
      <button className="fm-summary" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="fm-caret">
          <svg className={'chevron-icon' + (open ? '' : ' collapsed')} viewBox="0 0 16 16" width="22" height="22" aria-hidden>
            <path d="M3.6 6 8 10.4 12.4 6" />
          </svg>
        </span>
        {parsed && !parsed.ok ? (
          <span className="fm-bad">Invalid properties</span>
        ) : (
          <>
            {isPrivate && (
              <span className="fm-lock" title={flagged ? 'Not sent to cloud models' : 'Private because a parent page is private'}>
                <LockIcon /> private{flagged ? '' : ' (inherited)'}
              </span>
            )}
            <span className={'fm-type' + (type ? '' : ' missing')}>{type ?? 'no type'}</span>
            {desc && <span className="fm-desc">{desc}</span>}
            {tags.slice(0, 4).map(t => (
              <span key={t} className="fm-tag">#{t}</span>
            ))}
            {tags.length > 4 && <span className="fm-more">+{tags.length - 4}</span>}
            {extra > 0 && <span className="fm-more">{extra} more</span>}
          </>
        )}
      </button>

      {open && (
        <div className="fm-body">
          {offered.length > 0 && (
            <div className="fm-add" onMouseLeave={() => setHelp('')}>
              <span className="fm-add-label">Add</span>
              {offered.map(k => (
                <button
                  key={k.key}
                  className={'fm-chip' + (k.key === 'private' ? ' fm-chip-private' : '')}
                  onClick={() => save(addYamlKey(text, k.key, k.insert))}
                  onMouseEnter={() => setHelp(`${k.key}: ${k.help}`)}
                  onFocus={() => setHelp(`${k.key}: ${k.help}`)}
                  onBlur={() => setHelp('')}
                >
                  {k.key === 'private' ? <LockIcon size={11} /> : '+ '}
                  {k.key === 'private' ? ' ' : ''}
                  {k.key}
                </button>
              ))}
            </div>
          )}
          <p className={'fm-help' + (help ? ' on' : '')}>{help || 'Pick a property to add it. Hover one to see what it does.'}</p>
          <textarea
            spellCheck={false}
            value={text}
            rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
            onChange={e => save(e.target.value)}
            placeholder={'type: note\ndescription: One line summary\ntags: [work]'}
          />
          {parsed && !parsed.ok && <p className="fm-error">{parsed.error}</p>}
          {hints.map(h => (
            <p key={h.key} className="fm-warn">
              {h.message}{' '}
              <button className="linklike" onClick={() => save(renameYamlKey(text, h.key, h.suggestion))}>
                Rename to {h.suggestion}
              </button>
            </p>
          ))}
          {type && (
            <p className="fm-types">
              <span>Types</span>
              {TYPE_IDEAS.map(t => (
                <button key={t} className={'fm-chip' + (t === type ? ' on' : '')} onClick={() => save(upsertYamlKey(text, 'type', t))}>
                  {t}
                </button>
              ))}
            </p>
          )}
          {parsed?.ok && !type && (
            <p className="fm-hint">
              Open Knowledge Format needs a <code>type</code>.{' '}
              <button className="linklike" onClick={() => save(`type: note\n${text}`)}>Add type: note</button>
            </p>
          )}
          <div className="fm-actions">
            <span>
              Open Knowledge Format · YAML. Unknown keys are kept as written.
            </span>
            <span className="fm-actions-right">
              <button
                className="linklike"
                onClick={() => setPrivate(!flagged)}
                title="Private pages, and everything under them, are never sent to a cloud model"
              >
                {flagged ? 'Remove private' : 'Mark private'}
              </button>
              <button className="linklike" onClick={() => (save(''), setOpen(false))}>Remove properties</button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
