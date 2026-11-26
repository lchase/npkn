import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The poller against a fake fetch and fake clock. Each test loads a fresh copy of the module, because
// the cache is module-level on purpose (shared across pages, gone on reload).
const MIN = 60_000
type Reply = { status: number; body?: unknown; headers?: Record<string, string> }
let visibility: DocumentVisibilityState = 'visible'
let undos: (() => void)[] = []

async function setup(reply: (url: string, n: number) => Reply, cfg: { enabled?: boolean; token?: string } = {}) {
  vi.resetModules()
  localStorage.setItem('npkn.github', JSON.stringify({ enabled: true, token: '', style: 'pill', ...cfg }))
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const r = reply(url, calls.length)
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers })
    }),
  )
  const { prBadgeSource } = await import('./status')
  const config = await import('./config')
  // Unwatched after each test, so an earlier test's module copy goes quiet instead of polling on.
  const watch = prBadgeSource.watch
  const src = { ...prBadgeSource, watch: (keys: string[]) => (undos.push(watch(keys)), undos[undos.length - 1]) }
  return { src, calls, config }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0)
}
const open = { status: 200, body: { state: 'open', draft: false, merged: false, title: 'T' } }

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  undos.forEach(u => u())
  undos = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('PR status poller', () => {
  it('sends nothing while the feature is off', async () => {
    const { src, calls } = await setup(() => open, { enabled: false })
    src.watch(['acme/web/1'])
    await flush()
    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(calls).toEqual([])
    expect(src.get('acme/web/1')).toBeNull()
  })

  it('duplicate PRs share one request', async () => {
    const { src, calls } = await setup(() => open)
    src.watch(['acme/web/1', 'acme/web/1'])
    src.watch(['acme/web/1'])
    await flush()
    expect(calls).toEqual(['https://api.github.com/repos/acme/web/pulls/1'])
    expect(src.get('acme/web/1')).toMatchObject({ state: 'open', title: 'T' })
  })

  it('polls an open PR once per interval, with the ETag', async () => {
    const { src, calls } = await setup(() => ({ ...open, headers: { etag: '"e1"' } }), { token: 'tok' })
    src.watch(['acme/web/1'])
    await flush()
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5 * MIN - 1000)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toHaveLength(2)
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[1][1]
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"e1"')
  })

  it('a merged PR is fetched once and never polled again', async () => {
    const { src, calls } = await setup(() => ({ status: 200, body: { state: 'closed', merged: true, title: 'T' } }))
    src.watch(['acme/web/1'])
    await flush()
    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(calls).toHaveLength(1)
    expect(src.get('acme/web/1')?.state).toBe('merged')
  })

  it('401 marks every badge rejected and stops polling until the token changes', async () => {
    const { src, calls, config } = await setup((_u, n) => (n <= 2 ? { status: 401 } : open), { token: 'bad' })
    src.watch(['acme/web/1', 'acme/web/2'])
    await flush()
    expect(calls).toHaveLength(2)
    expect(src.get('acme/web/1')?.problem).toBe('rejected')
    expect(src.get('acme/web/2')?.problem).toBe('rejected')
    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(calls).toHaveLength(2)
    config.setGithubConfig({ token: 'good' })
    await flush()
    expect(calls).toHaveLength(4)
    expect(src.get('acme/web/1')).toMatchObject({ state: 'open' })
    expect(src.get('acme/web/1')?.problem).toBeUndefined()
  })

  it('a rate limit pauses all polling until the reset, keeping the last state', async () => {
    const reset = () => String(Math.floor(Date.now() / 1000) + 10 * 60)
    const { src, calls } = await setup((_u, n) =>
      n === 1 ? open : n === 2 ? { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset() } } : open,
    )
    src.watch(['acme/web/1'])
    await flush()
    expect(calls).toHaveLength(1)
    // A second PR appears on the page and hits the limit.
    src.watch(['acme/web/2'])
    await flush()
    expect(calls).toHaveLength(2)
    expect(src.get('acme/web/1')).toMatchObject({ state: 'open', problem: 'ratelimited' })
    await vi.advanceTimersByTimeAsync(9 * MIN)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2 * MIN)
    await flush()
    // Resumed: PR 2 is asked again, PR 1 is due on its own schedule (5 min from its first check).
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(calls.slice(2)).toContain('https://api.github.com/repos/acme/web/pulls/2')
    expect(src.get('acme/web/2')).toMatchObject({ state: 'open' })
    expect(src.get('acme/web/1')?.problem).toBeUndefined()
  })

  it('404 shows no access and is not asked again until its page is reopened', async () => {
    const { src, calls } = await setup((_u, n) => (n === 1 ? { status: 404 } : open))
    let unwatch = src.watch(['acme/web/1'])
    await flush()
    expect(src.get('acme/web/1')?.problem).toBe('noaccess')
    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(calls).toHaveLength(1)
    unwatch()
    unwatch = src.watch(['acme/web/1'])
    await flush()
    expect(calls).toHaveLength(2)
    expect(src.get('acme/web/1')?.state).toBe('open')
  })

  it('pauses while hidden and refreshes stale PRs at once when visible again', async () => {
    const { src, calls } = await setup(() => open)
    src.watch(['acme/web/1'])
    await flush()
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(calls).toHaveLength(1)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(calls).toHaveLength(2)
  })

  it('a network error keeps the last state and retries next tick', async () => {
    const { src, calls } = await setup((_u, n) => {
      if (n === 2) throw new TypeError('offline')
      return open
    })
    src.watch(['acme/web/1'])
    await flush()
    await vi.advanceTimersByTimeAsync(5 * MIN)
    await flush()
    expect(calls).toHaveLength(2)
    expect(src.get('acme/web/1')).toMatchObject({ state: 'open' })
    expect(src.get('acme/web/1')?.problem).toBeUndefined()
    await vi.advanceTimersByTimeAsync(5 * MIN)
    await flush()
    expect(calls).toHaveLength(3)
  })
})
