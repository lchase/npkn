import { useSyncExternalStore } from 'react'
import { PROVIDERS, type ProviderId } from './providers'
import type { ChatProvider } from './provider'

/**
 * Which model answers Ask, and how to reach it. Stored in this browser only (localStorage). API keys
 * are the user's own and live here in plain text, the same way a saved password field would; they are
 * only ever sent as a request header to the provider they belong to.
 */
export interface AiConfig {
  provider: ProviderId
  ollama: { base: string; model: string }
  anthropic: { key: string; model: string }
  openai: { base: string; key: string; model: string }
}

const KEY = 'npkn.ai'
const LEGACY = 'npkn.ask'

const DEFAULTS: AiConfig = {
  provider: 'ollama',
  ollama: { base: PROVIDERS.ollama.defaultBase, model: '' },
  anthropic: { key: '', model: '' },
  openai: { base: PROVIDERS.openai.defaultBase, key: '', model: '' },
}

function load(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<AiConfig>
      return {
        provider: p.provider && p.provider in PROVIDERS ? p.provider : 'ollama',
        ollama: { ...DEFAULTS.ollama, ...p.ollama },
        anthropic: { ...DEFAULTS.anthropic, ...p.anthropic },
        openai: { ...DEFAULTS.openai, ...p.openai },
      }
    }
    // Before providers existed, Ask only knew Ollama and kept {base, model} under another key.
    const old = localStorage.getItem(LEGACY)
    if (old) {
      const o = JSON.parse(old) as { base?: string; model?: string }
      return { ...DEFAULTS, ollama: { base: o.base || DEFAULTS.ollama.base, model: o.model || '' } }
    }
  } catch {
    /* fall through */
  }
  return structuredClone(DEFAULTS)
}

let config = load()
let snapshot = config
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(config))
  } catch {
    /* storage blocked: settings just won't persist */
  }
}

export function getAiConfig(): AiConfig {
  return config
}

export function setAiConfig(patch: {
  provider?: ProviderId
  ollama?: Partial<AiConfig['ollama']>
  anthropic?: Partial<AiConfig['anthropic']>
  openai?: Partial<AiConfig['openai']>
}) {
  config = {
    provider: patch.provider ?? config.provider,
    ollama: { ...config.ollama, ...patch.ollama },
    anthropic: { ...config.anthropic, ...patch.anthropic },
    openai: { ...config.openai, ...patch.openai },
  }
  snapshot = config
  persist()
  listeners.forEach(l => l())
}

export function useAiConfig(): AiConfig {
  return useSyncExternalStore(
    cb => (listeners.add(cb), () => void listeners.delete(cb)),
    () => snapshot,
  )
}

export interface ActiveProvider {
  provider: ChatProvider
  /**
   * True only when requests go to this machine. Decided by the address, not the provider's name: an
   * Ollama server on another host is not private, and LM Studio on localhost is.
   */
  local: boolean
  base: string
  model: string
  apiKey: string
  /** Everything needed to attempt a request is filled in. */
  ready: boolean
  /** Why it isn't ready, in words the user can act on. */
  reason?: string
}

export function isLoopback(base: string): boolean {
  try {
    const h = new URL(base).hostname.replace(/^\[|\]$/g, '')
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h.endsWith('.localhost')
  } catch {
    return false
  }
}

/** The provider, endpoint, model and key currently selected. */
export function activeProvider(c: AiConfig = config): ActiveProvider {
  const provider = PROVIDERS[c.provider]
  const s = c[c.provider] as { base?: string; key?: string; model: string }
  const base = s.base ?? provider.defaultBase
  const apiKey = s.key ?? ''
  let reason: string | undefined
  if (provider.needsKey && !apiKey) reason = `Add your ${provider.label} API key in Settings.`
  else if (!s.model) reason = 'Pick a model.'
  return { provider, local: provider.kind === 'local' || provider.id === 'openai' ? isLoopback(base) : false, base, model: s.model, apiKey, ready: !reason, reason }
}
