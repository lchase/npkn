import { prStateOf, type PrRef, type PrState } from '../../core/pullRequests'

/**
 * The only code that talks to GitHub. Rules: the token goes in the Authorization header and nowhere
 * else (not the URL, not a body, not a log or error message), and response bodies are never logged or
 * echoed: only status codes and the few fields we read.
 */
export const GITHUB_API = 'https://api.github.com'

export type PrFetch =
  | { kind: 'ok'; state: PrState; title: string; etag?: string }
  | { kind: 'not-modified' }
  | { kind: 'unauthorized' }
  | { kind: 'not-found' }
  /** `until` is epoch ms, from Retry-After or x-ratelimit-reset. */
  | { kind: 'rate-limited'; until: number }
  /** Offline, a 5xx, or anything else: keep what we had and try again next tick. */
  | { kind: 'error' }

const headers = (token: string, etag?: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(etag ? { 'If-None-Match': etag } : {}),
})

function rateLimitedUntil(res: Response, now: number): number | null {
  const retry = res.headers.get('retry-after')
  const reset = res.headers.get('x-ratelimit-reset')
  const limited = res.status === 429 || (res.status === 403 && (retry !== null || res.headers.get('x-ratelimit-remaining') === '0'))
  if (!limited) return null
  if (retry !== null && Number.isFinite(Number(retry))) return now + Number(retry) * 1000
  if (reset !== null && Number.isFinite(Number(reset))) return Number(reset) * 1000
  return now + 60_000
}

export async function fetchPr(ref: PrRef, opts: { token: string; etag?: string; base?: string }): Promise<PrFetch> {
  const url = `${opts.base ?? GITHUB_API}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`
  let res: Response
  try {
    res = await fetch(url, { headers: headers(opts.token, opts.etag), cache: 'no-store' })
  } catch {
    return { kind: 'error' }
  }
  if (res.status === 304) return { kind: 'not-modified' }
  if (res.status === 401) return { kind: 'unauthorized' }
  const until = rateLimitedUntil(res, Date.now())
  if (until !== null) return { kind: 'rate-limited', until }
  // A 403 that isn't a rate limit (an SSO-enforced org the token isn't authorized for) reads like a 404:
  // the token can't see this PR.
  if (res.status === 404 || res.status === 403) return { kind: 'not-found' }
  if (!res.ok) return { kind: 'error' }
  try {
    const body = (await res.json()) as { state?: string; draft?: boolean; merged?: boolean; title?: unknown }
    return { kind: 'ok', state: prStateOf(body), title: typeof body.title === 'string' ? body.title : '', etag: res.headers.get('etag') ?? undefined }
  } catch {
    return { kind: 'error' }
  }
}

/** `GET /user`: the login a token belongs to. Throws a message fit to show, never including the token. */
export async function verifyToken(token: string, base = GITHUB_API): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${base}/user`, { headers: headers(token), cache: 'no-store' })
  } catch {
    throw new Error("Couldn't reach GitHub.")
  }
  if (res.status === 401) throw new Error('GitHub rejected the token (401). It may be wrong or expired.')
  if (rateLimitedUntil(res, Date.now()) !== null) throw new Error('GitHub rate limit reached. Try again later.')
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
  const body = (await res.json().catch(() => ({}))) as { login?: unknown }
  if (typeof body.login !== 'string') throw new Error('GitHub sent an unexpected answer.')
  return body.login
}
