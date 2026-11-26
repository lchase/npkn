import { useSyncExternalStore } from 'react'

/**
 * GitHub PR badges settings, stored in this browser only (localStorage). `enabled` is the consent:
 * nothing goes to GitHub while it is off. The token is optional, the user's own, and only ever sent in
 * the Authorization header to api.github.com.
 */
export type BadgeStyle = 'pill' | 'title'

export interface GithubConfig {
  enabled: boolean
  token: string
  style: BadgeStyle
}

const KEY = 'npkn.github'
const DEFAULTS: GithubConfig = { enabled: false, token: '', style: 'pill' }

function load(): GithubConfig {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GithubConfig>
    return {
      enabled: p.enabled === true,
      token: typeof p.token === 'string' ? p.token : '',
      style: p.style === 'title' ? 'title' : 'pill',
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let config = load()
const listeners = new Set<() => void>()

export const getGithubConfig = () => config

export function setGithubConfig(patch: Partial<GithubConfig>) {
  config = { ...config, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(config))
  } catch {
    /* storage blocked: settings just won't persist */
  }
  listeners.forEach(l => l())
}

export function subscribeGithubConfig(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

export const useGithubConfig = () => useSyncExternalStore(subscribeGithubConfig, getGithubConfig)
