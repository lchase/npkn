/**
 * GitHub pull request links: which hrefs count, what a REST body says about the PR, and how often to ask.
 * Pure. Terms follow GLOSSARY.md: PR state (what GitHub says) vs badge state (what the badge shows).
 */

export interface PrRef {
  owner: string
  repo: string
  number: number
}

export type PrState = 'draft' | 'open' | 'merged' | 'closed'

/**
 * What a badge needs. No `state` and no `problem` means it is still being checked. `state` is the last
 * known PR state and is kept through problems that don't invalidate it (rate limited, offline).
 */
export interface PrBadge {
  state?: PrState
  title?: string
  /** Epoch ms of the last answer from GitHub. */
  checkedAt?: number
  problem?: 'noaccess' | 'rejected' | 'ratelimited'
}

// github.com only (no Enterprise hosts); the PR page itself or its /files or /commits tabs, then an
// optional query or fragment. Anything else on GitHub (issues, repos, compare) is not a PR link.
const PR_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:\/(?:files|commits)(?:\/[^?#]*)?)?\/?(?:[?#].*)?$/

export function parsePrUrl(href: string): PrRef | null {
  const m = PR_URL.exec(href)
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null
}

/** Cache key. Lower-cased because GitHub owner and repo names are case-insensitive. */
export const prKey = (r: PrRef) => `${r.owner}/${r.repo}/${r.number}`.toLowerCase()

export function parsePrKey(key: string): PrRef {
  const [owner, repo, n] = key.split('/')
  return { owner, repo, number: Number(n) }
}

/** PR state from a `GET /repos/{o}/{r}/pulls/{n}` body. Merged wins over closed, closed over draft. */
export function prStateOf(body: { state?: string; draft?: boolean; merged?: boolean }): PrState {
  if (body.merged) return 'merged'
  if (body.state === 'closed') return 'closed'
  if (body.draft) return 'draft'
  return 'open'
}

const MIN = 60_000

/**
 * How long a PR's state is good for. With a token, 5 minutes. Without, the 60/hour per-IP quota is
 * shared by every PR on the page (and unauthenticated 304s still count), so each PR gets 2 minutes of
 * spacing: at most 30 requests an hour.
 */
export function pollInterval(hasToken: boolean, distinctPrs: number): number {
  return hasToken ? 5 * MIN : Math.max(5 * MIN, distinctPrs * 2 * MIN)
}
