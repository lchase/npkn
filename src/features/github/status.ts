import { parsePrKey, pollInterval, type PrBadge, type PrState } from '../../core/pullRequests'
import { fetchPr } from './client'
import { getGithubConfig, subscribeGithubConfig } from './config'

/**
 * PR states for the badges: one in-memory cache shared by every page (a reload starts empty), and one
 * poller that refreshes only the PRs on the open page, only while the feature is on and the window is
 * visible. App hands `prBadgeSource` to the editor (editor/prBadges.ts).
 */
interface Entry {
  state?: PrState
  title?: string
  etag?: string
  /** Last answer from GitHub (shown on hover). */
  checkedAt?: number
  /** Last attempt, answered or not; drives the schedule so a network error waits a full interval. */
  triedAt?: number
  /** 404: not asked again until its page is reopened (or the token changes). */
  noAccess?: boolean
  inflight?: boolean
}

const cache = new Map<string, Entry>()
/** PR key -> how many open editors show it. */
const watched = new Map<string, number>()
const listeners = new Set<() => void>()
/** The token GitHub answered 401 for; polling stops until the token is something else. */
let rejected: string | null = null
let pausedUntil = 0
let timer: ReturnType<typeof setTimeout> | undefined
let token = getGithubConfig().token
let notifyQueued = false

function notify() {
  // Batched to a microtask: the editor redraws on this, and must not be asked to mid-update.
  if (notifyQueued) return
  notifyQueued = true
  queueMicrotask(() => {
    notifyQueued = false
    listeners.forEach(l => l())
  })
}

const entry = (key: string) => {
  let e = cache.get(key)
  if (!e) cache.set(key, (e = {}))
  return e
}

const isRejected = () => rejected !== null && rejected === getGithubConfig().token

function active() {
  return getGithubConfig().enabled && watched.size > 0 && !isRejected() && document.visibilityState === 'visible'
}

/** When the entry next needs asking; Infinity for never. A merged PR is fetched once per session. */
function dueAt(e: Entry): number {
  if (e.noAccess || e.state === 'merged') return Infinity
  if (e.triedAt === undefined) return 0
  return e.triedAt + pollInterval(!!getGithubConfig().token, watched.size)
}

function pump() {
  clearTimeout(timer)
  timer = undefined
  if (!active()) return
  const now = Date.now()
  if (pausedUntil > now) {
    timer = setTimeout(pump, pausedUntil - now)
    return
  }
  if (pausedUntil) {
    pausedUntil = 0
    notify()
  }
  let next = Infinity
  for (const key of watched.keys()) {
    const e = entry(key)
    if (e.inflight) continue
    const due = dueAt(e)
    if (due <= now) void refresh(key, e)
    else next = Math.min(next, due)
  }
  if (next < Infinity) timer = setTimeout(pump, next - now)
}

async function refresh(key: string, e: Entry) {
  e.inflight = true
  const sentWith = getGithubConfig().token
  const r = await fetchPr(parsePrKey(key), { token: sentWith, etag: e.etag })
  e.inflight = false
  // The token changed while this was in flight: its answer describes the old token. Ask again.
  if (sentWith !== getGithubConfig().token) return pump()
  const now = Date.now()
  e.triedAt = now
  switch (r.kind) {
    case 'ok':
      Object.assign(e, { state: r.state, title: r.title, etag: r.etag, checkedAt: now })
      break
    case 'not-modified':
      e.checkedAt = now
      break
    case 'not-found':
      e.noAccess = true
      break
    case 'unauthorized':
      rejected = sentWith
      break
    case 'rate-limited':
      e.triedAt = undefined
      pausedUntil = Math.max(pausedUntil, r.until)
      break
    case 'error':
      break
  }
  notify()
  pump()
}

subscribeGithubConfig(() => {
  const next = getGithubConfig().token
  if (next !== token) {
    token = next
    // A new token can see what the old one couldn't, and reads with a different quota.
    for (const e of cache.values()) {
      e.noAccess = false
      e.triedAt = undefined
    }
  }
  notify()
  pump()
})

document.addEventListener('visibilitychange', pump)

export const prBadgeSource = {
  get(key: string): PrBadge | null {
    if (!getGithubConfig().enabled) return null
    const e = cache.get(key) ?? {}
    const known = { state: e.state, title: e.title, checkedAt: e.checkedAt }
    if (isRejected()) return { ...known, problem: 'rejected' }
    if (e.noAccess) return { ...known, problem: 'noaccess' }
    if (pausedUntil > Date.now()) return { ...known, problem: 'ratelimited' }
    return known
  },
  style: () => getGithubConfig().style,
  subscribe(cb: () => void) {
    listeners.add(cb)
    return () => void listeners.delete(cb)
  },
  /** Mark PRs as on the open page. Returns the undo. A PR newly on screen gets its 404 forgiven. */
  watch(keys: string[]) {
    for (const k of keys) {
      const n = watched.get(k) ?? 0
      if (n === 0 && cache.get(k)?.noAccess) cache.get(k)!.noAccess = false
      watched.set(k, n + 1)
    }
    pump()
    return () => {
      for (const k of keys) {
        const n = (watched.get(k) ?? 1) - 1
        if (n > 0) watched.set(k, n)
        else watched.delete(k)
      }
      pump()
    }
  },
}
