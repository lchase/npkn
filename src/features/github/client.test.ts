// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchPr, verifyToken } from './client'

// A stand-in for api.github.com. The repo name picks the answer; it records what it was sent.
let server: http.Server
let base = ''
let last: { url: string; headers: http.IncomingHttpHeaders; body: string } | null = null
const ETAG = 'W/"abc"'
const RESET = 2_000_000_000

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    last = { url: req.url ?? '', headers: req.headers, body }
    const send = (status: number, json?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(json === undefined ? undefined : JSON.stringify(json))
    }
    const repo = (req.url ?? '').split('/')[3]
    if (req.url === '/user') return req.headers.authorization === 'Bearer good' ? send(200, { login: 'octo' }) : send(401, { message: 'Bad credentials' })
    if (repo === 'ok') {
      if (req.headers['if-none-match'] === ETAG) return send(304)
      return send(200, { state: 'open', draft: true, merged: false, title: 'Fix it' }, { etag: ETAG })
    }
    if (repo === 'merged') return send(200, { state: 'closed', merged: true, title: 'Done' })
    if (repo === 'denied') return send(401, { message: 'Bad credentials' })
    if (repo === 'missing') return send(404, { message: 'Not Found' })
    if (repo === 'sso') return send(403, { message: 'SSO' }, { 'x-ratelimit-remaining': '4000' })
    if (repo === 'limited') return send(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) })
    if (repo === 'retry') return send(429, { message: 'slow down' }, { 'retry-after': '30' })
    if (repo === 'boom') return send(502)
    send(500)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(r => server.close(() => r())))

const pr = (repo: string) => ({ owner: 'acme', repo, number: 7 })

describe('fetchPr', () => {
  it('200: reads state, title and ETag from GET /repos/{o}/{r}/pulls/{n}', async () => {
    expect(await fetchPr(pr('ok'), { token: '', base })).toEqual({ kind: 'ok', state: 'draft', title: 'Fix it', etag: ETAG })
    expect(last!.url).toBe('/repos/acme/ok/pulls/7')
    expect(last!.headers.authorization).toBeUndefined()
    expect(last!.headers['if-none-match']).toBeUndefined()
  })

  it('304: sends the stored ETag as If-None-Match', async () => {
    expect(await fetchPr(pr('ok'), { token: '', etag: ETAG, base })).toEqual({ kind: 'not-modified' })
    expect(last!.headers['if-none-match']).toBe(ETAG)
  })

  it('merged', async () => {
    expect(await fetchPr(pr('merged'), { token: '', base })).toMatchObject({ kind: 'ok', state: 'merged' })
  })

  it('401, 404, and a 403 that is not a rate limit', async () => {
    expect(await fetchPr(pr('denied'), { token: 't', base })).toEqual({ kind: 'unauthorized' })
    expect(await fetchPr(pr('missing'), { token: '', base })).toEqual({ kind: 'not-found' })
    expect(await fetchPr(pr('sso'), { token: 't', base })).toEqual({ kind: 'not-found' })
  })

  it('403 rate limit pauses until x-ratelimit-reset; 429 until Retry-After', async () => {
    expect(await fetchPr(pr('limited'), { token: '', base })).toEqual({ kind: 'rate-limited', until: RESET * 1000 })
    const before = Date.now()
    const r = await fetchPr(pr('retry'), { token: '', base })
    expect(r.kind).toBe('rate-limited')
    const until = (r as { until: number }).until
    expect(until).toBeGreaterThanOrEqual(before + 30_000)
    expect(until).toBeLessThan(before + 35_000)
  })

  it('5xx and network errors are plain errors', async () => {
    expect(await fetchPr(pr('boom'), { token: '', base })).toEqual({ kind: 'error' })
    expect(await fetchPr(pr('ok'), { token: '', base: 'http://127.0.0.1:1' })).toEqual({ kind: 'error' })
  })

  it('sends the token only in the Authorization header', async () => {
    await fetchPr(pr('ok'), { token: 'ghp_secret123', base })
    expect(last!.headers.authorization).toBe('Bearer ghp_secret123')
    expect(last!.url).not.toContain('ghp_secret123')
    expect(last!.body).toBe('')
    const others = Object.entries(last!.headers).filter(([k]) => k !== 'authorization')
    expect(JSON.stringify(others)).not.toContain('ghp_secret123')
  })
})

describe('verifyToken', () => {
  it('returns the login', async () => {
    expect(await verifyToken('good', base)).toBe('octo')
    expect(last!.url).toBe('/user')
  })

  it('a rejected token throws a message without the token or the response body', async () => {
    const err = (await verifyToken('ghp_wrong', base).then(
      () => new Error('resolved'),
      (e: Error) => e,
    ))
    expect(err.message).toMatch(/401/)
    expect(err.message).not.toContain('ghp_wrong')
    expect(err.message).not.toContain('Bad credentials')
  })
})
