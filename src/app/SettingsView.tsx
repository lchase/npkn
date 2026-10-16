import { useMemo, useState } from 'react'
import {
  GROUPS,
  GROUP_LABEL,
  LABELS_PAGE_ID,
  collectLabels,
  effectiveRegistry,
  overridesOf,
  parseRegistry,
  statusList,
  type Group,
  type LabelDef,
} from '../core/labels'
import type { Page } from '../core/types'
import { saveLabelOverrides } from '../data/labels'
import { hueFor } from '../editor/chip'
import { activeProvider, setAiConfig, useAiConfig, type AiConfig } from '../features/ask/config'
import { OPENAI_PRESETS } from '../features/ask/openai'
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from '../features/ask/providers'
import { pickDefaultModel } from '../features/ask/useModels'
import { WIDTHS, setPageWidth, usePageWidth } from '../ui/display'

type Test = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; models: string[] } | { state: 'error'; message: string }

/** Where requests actually go, so the privacy note names a destination rather than a category. */
function destination(cfg: AiConfig, id: ProviderId): string {
  if (id === 'anthropic') return 'Anthropic'
  if (id === 'openai') {
    try {
      return new URL(cfg.openai.base).host
    } catch {
      return 'the configured service'
    }
  }
  return 'this machine'
}

const BLURB: Record<ProviderId, string> = {
  ollama: 'Runs on your own machine. Your notes never leave it.',
  anthropic: 'Claude, using your own Anthropic API key.',
  openai: 'OpenAI, or any OpenAI-compatible service such as OpenRouter or LM Studio.',
}

export function SettingsView({ pages }: { pages: Page[] }) {
  const cfg = useAiConfig()
  const width = usePageWidth()
  const [tests, setTests] = useState<Partial<Record<ProviderId, Test>>>({})
  const [reveal, setReveal] = useState(false)
  const active = activeProvider(cfg)

  // ---- labels ----
  const labelsPage = pages.find(p => p.id === LABELS_PAGE_ID)
  const user = useMemo(() => parseRegistry(labelsPage?.frontmatter), [labelsPage?.frontmatter])
  const reg = useMemo(() => effectiveRegistry(user), [user])
  const used = useMemo(() => collectLabels(pages), [pages])
  const [newStatus, setNewStatus] = useState('')
  const [newGroup, setNewGroup] = useState<Group>('active')

  const saveReg = (next: typeof reg) => saveLabelOverrides(pages, overridesOf(next))
  const edit = (name: string, patch: LabelDef) => saveReg({ ...reg, [name]: { ...reg[name], ...patch } })
  const clearColor = (name: string) => {
    const { color: _drop, ...rest } = reg[name] ?? {}
    void _drop
    return saveReg({ ...reg, [name]: rest })
  }
  const removeCustom = (name: string) => {
    const { [name]: _drop, ...rest } = reg
    void _drop
    return saveReg(rest)
  }
  const statuses = statusList(reg)
  const statusNames = new Set(statuses.map(s => s.label))
  const categories = [...used.keys()].filter(k => !statusNames.has(k)).sort()
  const isBuiltIn = (n: string) => ['todo', 'doing', 'blocked', 'in-review', 'done'].includes(n)
  const nameOk = /^[\w-]+$/.test(newStatus.trim()) && !reg[newStatus.trim().toLowerCase()]?.kind

  const preview = (name: string) => (
    <span className="chip chip-category" data-label={name} style={{ ['--h' as any]: hueFor(name) }}>
      {name}
    </span>
  )

  const choose = (id: ProviderId) => {
    if (id === cfg.provider) return
    const p = PROVIDERS[id]
    if (p.kind === 'cloud') {
      const ok = confirm(
        `Use ${p.label} for Ask?\n\n` +
          `When you ask a question, the question and the note excerpts needed to answer it are sent to ${id === 'openai' ? 'the service you configure' : p.label}. ` +
          'Your whole notebook is not uploaded, and nothing is sent until you ask.\n\n' +
          'Your API key is stored in this browser or app only.',
      )
      if (!ok) return
    }
    setAiConfig({ provider: id })
  }

  const test = async (id: ProviderId) => {
    const c = cfg[id] as { base?: string; key?: string }
    const p = PROVIDERS[id]
    setTests(t => ({ ...t, [id]: { state: 'testing' } }))
    try {
      const models = await p.listModels(c.base ?? p.defaultBase, undefined, c.key ?? '')
      setTests(t => ({ ...t, [id]: { state: 'ok', models } }))
      const cur = (cfg[id] as { model: string }).model
      if (!cur || !models.includes(cur)) setAiConfig({ [id]: { model: pickDefaultModel(id, models) } })
    } catch (e) {
      setTests(t => ({ ...t, [id]: { state: 'error', message: (e as Error).message } }))
    }
  }

  const modelField = (id: ProviderId) => {
    const t = tests[id]
    const models = t?.state === 'ok' ? t.models : []
    const model = (cfg[id] as { model: string }).model
    return (
      <label className="set-field">
        <span>Model</span>
        {models.length ? (
          <select value={model} onChange={e => setAiConfig({ [id]: { model: e.target.value } })}>
            {!models.includes(model) && <option value={model}>{model || 'Select…'}</option>}
            {models.map(m => (
              <option key={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input value={model} placeholder="Test the connection to list models, or type one" onChange={e => setAiConfig({ [id]: { model: e.target.value } })} />
        )}
      </label>
    )
  }

  const testRow = (id: ProviderId) => {
    const t = tests[id] ?? { state: 'idle' }
    return (
      <div className="set-test">
        <button onClick={() => void test(id)} disabled={t.state === 'testing'}>
          {t.state === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {t.state === 'ok' && <span className="ok">Connected · {t.models.length} models</span>}
        {t.state === 'error' && <span className="bad">{t.message}</span>}
      </div>
    )
  }

  const keyField = (id: 'anthropic' | 'openai', optional = false) => (
    <label className="set-field">
      <span>API key{optional ? ' (optional for local servers)' : ''}</span>
      <span className="set-key">
        <input
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={cfg[id].key}
          placeholder={id === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          onChange={e => setAiConfig({ [id]: { key: e.target.value.trim() } })}
        />
        <button type="button" className="linklike" onClick={() => setReveal(r => !r)}>
          {reveal ? 'Hide' : 'Show'}
        </button>
        {cfg[id].key && (
          <button type="button" className="linklike" onClick={() => setAiConfig({ [id]: { key: '' } })}>
            Clear
          </button>
        )}
      </span>
    </label>
  )

  const details = (id: ProviderId) => {
    if (id === 'ollama')
      return (
        <>
          <label className="set-field">
            <span>Server URL</span>
            <input value={cfg.ollama.base} onChange={e => setAiConfig({ ollama: { base: e.target.value.trim() } })} />
          </label>
          {modelField('ollama')}
          {testRow('ollama')}
          <p className="set-hint">
            Start it with <code>ollama serve</code>. Models you've pulled show up after testing. A small one is plenty
            for this: <code>ollama pull qwen3.5:4b</code> (about 3.3 GB) answered as accurately as a 27B model in a
            fraction of the time.
          </p>
        </>
      )
    if (id === 'anthropic')
      return (
        <>
          {keyField('anthropic')}
          {modelField('anthropic')}
          {testRow('anthropic')}
        </>
      )
    return (
      <>
        <div className="set-field">
          <span>Service</span>
          <span className="set-presets">
            {OPENAI_PRESETS.map(p => (
              <button key={p.base} className={cfg.openai.base === p.base ? 'on' : ''} onClick={() => setAiConfig({ openai: { base: p.base, model: '' } })}>
                {p.label}
              </button>
            ))}
          </span>
        </div>
        <label className="set-field">
          <span>Base URL</span>
          <input value={cfg.openai.base} onChange={e => setAiConfig({ openai: { base: e.target.value.trim() } })} />
        </label>
        {keyField('openai', /localhost|127\.0\.0\.1/.test(cfg.openai.base))}
        {modelField('openai')}
        {testRow('openai')}
      </>
    )
  }

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section>
        <h2>Display</h2>
        <p className="set-sub">How wide the page is for notes and the Todos list.</p>
        <div className="width-options" role="radiogroup" aria-label="Page width">
          {WIDTHS.map(w => (
            <button
              key={w.id}
              role="radio"
              aria-checked={width === w.id}
              className={'width-option' + (width === w.id ? ' on' : '')}
              onClick={() => setPageWidth(w.id)}
            >
              <span className={'width-sample width-' + w.id}>
                <i />
                <i />
                <i />
              </span>
              <strong>{w.label}</strong>
              <span>{w.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Ask: language model</h2>
        <p className="set-sub">Choose what answers questions about your notes.</p>

        <div className="set-providers">
          {PROVIDER_ORDER.map(id => {
            const p = PROVIDERS[id]
            const on = cfg.provider === id
            return (
              <div key={id} className={'set-provider' + (on ? ' on' : '')}>
                <button className="set-provider-head" onClick={() => choose(id)} aria-pressed={on}>
                  <span className={'radio' + (on ? ' on' : '')} />
                  <span className="set-provider-title">
                    {p.label}
                    <em className={p.kind}>{p.kind === 'local' ? 'Local' : 'Cloud'}</em>
                  </span>
                  <span className="set-provider-blurb">{BLURB[id]}</span>
                </button>
                {on && <div className="set-provider-body">{details(id)}</div>}
              </div>
            )
          })}

          <div className="set-provider disabled">
            <div className="set-provider-head">
              <span className="radio" />
              <span className="set-provider-title">
                Hosted by npkn<em className="soon">Later</em>
              </span>
              <span className="set-provider-blurb">Models routed for you, no key needed. Needs the hosted backend, which doesn't exist yet.</span>
            </div>
          </div>
        </div>

        <div className={'set-privacy ' + (active.local ? 'local' : 'cloud')}>
          {active.local ? (
            <>
              <strong>On this machine.</strong> Questions and note excerpts stay here, including pages marked
              <code>private</code>.
            </>
          ) : (
            <>
              <strong>Not private.</strong> When you ask, your question and the note excerpts needed to answer it are sent to{' '}
              <strong>{destination(cfg, cfg.provider)}</strong>. Your whole notebook is not uploaded. Your API key is stored in this browser or app only, in plain
              text, and sent only to that provider. Pages marked <code>private</code>, and everything under them,
              are never included.
            </>
          )}
        </div>
      </section>

      <section>
        <h2>Labels and statuses</h2>
        <p className="set-sub">
          Any <code>@label</code> can be given a color. Some labels are <strong>statuses</strong>: each one sits in a group that says
          what it means for a todo. Ticking a todo, or tagging it with a status in <em>Done</em>, finishes it.
        </p>

        <div className="lbl-groups">
          {GROUPS.map(g => (
            <div key={g} className="lbl-group">
              <h3>{GROUP_LABEL[g]}</h3>
              {statuses.filter(s => s.group === g).length === 0 && <p className="set-hint">None.</p>}
              {statuses
                .filter(s => s.group === g)
                .map(s => (
                  <div key={s.label} className="lbl-row">
                    <input
                      type="color"
                      aria-label={`${s.label} color`}
                      value={reg[s.label]?.color ?? '#888888'}
                      onChange={e => edit(s.label, { color: e.target.value })}
                    />
                    {preview(s.label)}
                    <select value={g} onChange={e => edit(s.label, { group: e.target.value as Group })} aria-label="Group">
                      {GROUPS.map(x => (
                        <option key={x} value={x}>
                          {GROUP_LABEL[x]}
                        </option>
                      ))}
                    </select>
                    <span className="lbl-actions">
                      {isBuiltIn(s.label) ? (
                        <button className="linklike" onClick={() => edit(s.label, { kind: 'category' })} title="Treat as an ordinary label">
                          Not a status
                        </button>
                      ) : (
                        <button className="linklike" onClick={() => removeCustom(s.label)}>
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>

        <form
          className="lbl-add"
          onSubmit={e => {
            e.preventDefault()
            const n = newStatus.trim().toLowerCase()
            if (!n || !nameOk) return
            void edit(n, { kind: 'status', group: newGroup }).then(() => setNewStatus(''))
          }}
        >
          <input value={newStatus} placeholder="New status, e.g. waiting-on" onChange={e => setNewStatus(e.target.value)} />
          <select value={newGroup} onChange={e => setNewGroup(e.target.value as Group)} aria-label="Group">
            {GROUPS.map(x => (
              <option key={x} value={x}>
                {GROUP_LABEL[x]}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!nameOk}>
            Add status
          </button>
        </form>

        <h3 className="lbl-sub">Other labels in your notes</h3>
        {categories.length === 0 ? (
          <p className="set-hint">None yet. Type <code>@work</code> (then a space) in a note to make one.</p>
        ) : (
          <div className="lbl-rows">
            {categories.map(n => (
              <div key={n} className="lbl-row">
                <input
                  type="color"
                  aria-label={`${n} color`}
                  value={reg[n]?.color ?? '#888888'}
                  onChange={e => edit(n, { color: e.target.value })}
                />
                {preview(n)}
                <span className="lbl-count">{used.get(n)} use{used.get(n) === 1 ? '' : 's'}</span>
                <span className="lbl-actions">
                  {reg[n]?.color ? (
                    <button className="linklike" onClick={() => clearColor(n)}>
                      Auto color
                    </button>
                  ) : (
                    <span className="lbl-auto">auto</span>
                  )}
                  <button
                    className="linklike"
                    onClick={() => edit(n, { kind: 'status', group: 'active' })}
                    title="Make this label a status (In progress). Change its group afterwards."
                  >
                    Make status
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="set-hint">
          Stored in a page called <strong>Labels</strong> in your notebook, so it syncs and exports with everything else.
        </p>
      </section>

      <section>
        <h2>Elsewhere</h2>
        <p className="set-sub">
          Theme and light/dark are in the sidebar footer, and the notebook folder is just above it. The assistant's character is under
          Ask → Character.
        </p>
      </section>
    </div>
  )
}
