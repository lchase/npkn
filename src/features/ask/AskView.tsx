import { useEffect, useRef, useState } from 'react'
import { privateIds } from '../../core/frontmatter'
import type { Page } from '../../core/types'
import { Avatar, type Mood } from './characters'
import { Gallery } from './characters/Gallery'
import { activeProvider, setAiConfig, useAiConfig } from './config'
import { Markdown } from './Markdown'
import type { Source } from './retrieve'
import { clear, send, setOffline, stop, useAsk } from './store'
import { useModels } from './useModels'
import { LockIcon } from '../../ui/icons'

/** Only the sources the answer actually cited; falls back to all of them if it cited none. */
function citedSources(text: string, sources: Source[]): Source[] {
  const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])))
  const picked = sources.filter(s => cited.has(s.n))
  return picked.length ? picked : sources
}

const STATUS: Record<Mood, string> = {
  idle: 'Ready',
  thinking: 'Thinking…',
  talking: 'Answering…',
  happy: 'Done!',
  error: "Something's wrong",
}

export function AskView({ pages, onOpen, onOpenSettings }: { pages: Page[]; onOpen: (id: string) => void; onOpenSettings: () => void }) {
  const { messages, busy, displayMood } = useAsk()
  const cfg = useAiConfig()
  const active = activeProvider(cfg)
  const { models, error } = useModels(active)
  const [input, setInput] = useState('')
  const [picking, setPicking] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOffline(!!error)
  }, [error])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const ask = (text: string) => {
    const q = text.trim()
    if (!q || busy || !active.ready) return
    setInput('')
    send(q, { pages })
  }

  const unreachable = !!error
  const cloud = !active.local
  const heldBack = cloud ? privateIds(pages).size : 0
  const problem = unreachable
    ? /\b(401|403)\b/.test(error)
      ? `${active.provider.label} refused the request: ${error}`
      : `Can't reach ${active.provider.label}: ${error}`
    : !active.ready
      ? active.reason
      : undefined

  return (
    <div className="ask">
      <aside className="ask-stage">
        <Avatar mood={displayMood} size="100%" />
        <div className={`stage-status ${displayMood}`}>{unreachable ? 'Offline' : STATUS[displayMood]}</div>
        <div
          className={'stage-provider ' + (cloud ? 'cloud' : 'local')}
          title={cloud ? 'Questions and the note excerpts used to answer them are sent to this provider.' : 'Everything stays on this machine.'}
        >
          {cloud ? '☁ Cloud' : '⌂ Local'} · {active.provider.label}
        </div>
        {heldBack > 0 && (
          <div className="stage-held" title="Pages marked private (and their sub-pages) are never sent to a cloud model.">
            <LockIcon size={12} /> {heldBack} private page{heldBack === 1 ? '' : 's'} held back
          </div>
        )}
        <div className="stage-controls">
          <select
            value={models.includes(active.model) ? active.model : ''}
            disabled={!models.length}
            onChange={e => setAiConfig({ [cfg.provider]: { model: e.target.value } })}
          >
            {models.length ? models.map(m => <option key={m}>{m}</option>) : <option value="">no models</option>}
          </select>
          {messages.length > 0 && (
            <button className="linklike" onClick={clear}>
              New chat
            </button>
          )}
          <button className="linklike" onClick={() => setPicking(p => !p)}>
            Character
          </button>
          <button className="linklike" onClick={onOpenSettings}>
            Settings
          </button>
        </div>
      </aside>

      <section className="ask-chat">
        {picking && <Gallery onClose={() => setPicking(false)} />}
        {problem && (
          <div className="ask-banner">
            {problem}{' '}
            <button className="linklike" onClick={onOpenSettings}>
              Open settings
            </button>
          </div>
        )}

        <div className="ask-thread">
          {messages.length === 0 && !problem && (
            <div className="ask-empty">
              <div className="bubble">Hi! I've read your notes. What do you want to know?</div>
              <div className="suggestions">
                {["What's due this week?", 'What are my open todos by category?', 'Which notes have the tag work?'].map(s => (
                  <button key={s} disabled={!active.ready} onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}${m.error ? ' error' : ''}`}>
              <div className="msg-body">
                {m.role === 'assistant' && !m.error ? (
                  m.content ? <Markdown text={m.content} /> : busy && i === messages.length - 1 ? '…' : ''
                ) : (
                  m.content
                )}
              </div>
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && m.content && !m.error && !(busy && i === messages.length - 1) && (
                <div className="msg-sources">
                  {citedSources(m.content, m.sources).map(s => (
                    <button key={s.pageId} onClick={() => onOpen(s.pageId)}>
                      [{s.n}] {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>

        <form
          className="ask-input"
          onSubmit={e => {
            e.preventDefault()
            ask(input)
          }}
        >
          <textarea
            rows={2}
            value={input}
            placeholder={active.ready ? 'Ask about your notes…' : 'Choose a model in Settings…'}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(input)
              }
            }}
          />
          {busy ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || !active.ready}>
              Ask
            </button>
          )}
        </form>
      </section>
    </div>
  )
}
