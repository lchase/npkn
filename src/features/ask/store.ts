import { useSyncExternalStore } from 'react'
import type { Page } from '../../core/types'
import { buildContext, type Source } from './retrieve'
import { activeProvider } from './config'
import { isLooping, trimLoop } from './repetition'
import type { ChatMessage } from './provider'
import type { Mood } from './characters'

export interface Msg {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  error?: boolean
  /** Wall-clock ms from sending the question to the reply finishing. */
  ms?: number
  /** The reply was cut off because the model was repeating itself (see repetition.ts). */
  looped?: boolean
  /** performance.now() when the question was sent; drives the live timer while busy. */
  startedAt?: number
}

interface State {
  messages: Msg[]
  busy: boolean
  mood: Mood
  /** Set by the view when Ollama can't be reached; overrides mood. */
  offline: boolean
}

/**
 * Chat lives outside React so a reply keeps streaming if you navigate away from the Ask view,
 * and so the sidebar avatar can show what the assistant is doing from any page.
 */
let state: State = { messages: [], busy: false, mood: 'idle', offline: false }
const listeners = new Set<() => void>()
let controller: AbortController | undefined
let calmTimer: number | undefined

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

function patchLast(fn: (m: Msg) => Msg) {
  set({ messages: state.messages.map((m, i) => (i === state.messages.length - 1 ? fn(m) : m)) })
}

export function useAsk(): State & { displayMood: Mood } {
  const s = useSyncExternalStore(
    cb => (listeners.add(cb), () => void listeners.delete(cb)),
    () => state,
  )
  return { ...s, displayMood: s.offline ? 'error' : s.mood }
}

export function setOffline(offline: boolean) {
  if (state.offline !== offline) set({ offline })
}

export function stop() {
  controller?.abort()
}

export function clear() {
  controller?.abort()
  window.clearTimeout(calmTimer)
  set({ messages: [], busy: false, mood: 'idle' })
}

export async function send(q: string, opts: { pages: Page[] }) {
  if (state.busy || !q.trim()) return
  const active = activeProvider()
  if (!active.ready) return
  window.clearTimeout(calmTimer)

  // Include the previous question in the retrieval query so follow-ups still match.
  const prevUser = [...state.messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const { system, sources } = buildContext(opts.pages, `${prevUser}\n${q}`, { includePrivate: active.local })

  const history: ChatMessage[] = state.messages
    .filter(m => !m.error && m.content)
    .map(m => ({ role: m.role, content: m.content }))
  const payload: ChatMessage[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: q }]

  const t0 = performance.now()
  set({
    messages: [...state.messages, { role: 'user', content: q }, { role: 'assistant', content: '', sources, startedAt: t0 }],
    busy: true,
    mood: 'thinking',
  })

  const ac = new AbortController()
  controller = ac
  let failed = false
  let looped = false
  try {
    for await (const piece of active.provider.chat({ base: active.base, model: active.model, apiKey: active.apiKey, messages: payload, signal: ac.signal })) {
      if (state.mood !== 'talking') set({ mood: 'talking' })
      patchLast(m => ({ ...m, content: m.content + piece }))
      if (isLooping(state.messages[state.messages.length - 1].content)) {
        looped = true
        patchLast(m => ({ ...m, content: trimLoop(m.content), looped: true }))
        ac.abort() // closes the request so the model stops generating too
        break
      }
    }
  } catch (e) {
    if (!ac.signal.aborted) {
      failed = true
      patchLast(m => ({ ...m, error: true, content: m.content || (e as Error).message }))
    }
  } finally {
    const stopped = ac.signal.aborted && !looped // the user pressed Stop; a loop cut-off still counts as an answer
    if (!failed && !stopped) patchLast(m => ({ ...m, ms: performance.now() - t0 }))
    const gotText = !!state.messages[state.messages.length - 1]?.content
    set({ busy: false, mood: failed ? 'error' : gotText && !stopped ? 'happy' : 'idle' })
    if (!failed) calmTimer = window.setTimeout(() => set({ mood: 'idle' }), 1800)
  }
}
