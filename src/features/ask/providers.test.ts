// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anthropicProvider } from './anthropic'
import { openaiProvider } from './openai'
import { readSSE } from './sse'
import type { ChatMessage } from './provider'

// A stand-in for both vendors. It records what it was sent and streams SSE in deliberately awkward
// chunks (splitting mid-line and mid-JSON) because that's where stream parsers go wrong.
let server: http.Server
let base = ''
let last: { url: string; headers: http.IncomingHttpHeaders; body: any } | null = null

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function sendChunked(res: http.ServerResponse, text: string, size = 7) {
  for (let i = 0; i < text.length; i += size) {
    res.write(text.slice(i, i + size))
    await sleep(1)
  }
  res.end()
}

const sse = (event: string | null, data: unknown) => `${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    last = { url: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : null }
    const key = String(req.headers['x-api-key'] ?? req.headers.authorization ?? '')

    if (req.url?.startsWith('/v1/models')) {
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ data: [{ id: 'claude-sonnet-x' }, { id: 'claude-haiku-x' }] }))
    }
    if (req.url === '/models') {
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ data: [{ id: 'zeta' }, { id: 'alpha' }] }))
    }
    if (key.includes('bad')) {
      res.statusCode = 401
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
    }

    res.setHeader('content-type', 'text/event-stream')
    if (req.url === '/v1/messages') {
      if (key.includes('overloaded')) {
        return sendChunked(res, sse('message_start', { type: 'message_start' }) + sse('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'par' } }) + sse('error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }))
      }
      const out =
        sse('message_start', { type: 'message_start', message: { id: 'm' } }) +
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
        ': keep-alive\n\n' +
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }) +
        sse('ping', { type: 'ping' }) +
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ', wor' } }) +
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ld — ünïcode' } }) +
        sse('content_block_stop', { type: 'content_block_stop', index: 0 }) +
        sse('message_stop', { type: 'message_stop' })
      return sendChunked(res, out, 5)
    }
    if (req.url === '/chat/completions') {
      const out =
        sse(null, { choices: [{ delta: { role: 'assistant', content: '' } }] }) +
        sse(null, { choices: [{ delta: { content: 'Hel' } }] }) +
        sse(null, { choices: [{ delta: {} }] }) +
        sse(null, { choices: [{ delta: { content: 'lo there' } }] }) +
        sse(null, '[DONE]') +
        sse(null, { choices: [{ delta: { content: 'SHOULD NOT APPEAR' } }] })
      return sendChunked(res, out, 11)
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(r => server.close(() => r())))

const collect = async (g: AsyncGenerator<string>) => {
  let s = ''
  for await (const p of g) s += p
  return s
}

const msgs: ChatMessage[] = [
  { role: 'system', content: 'You answer from notes.' },
  { role: 'user', content: 'Q1' },
  { role: 'assistant', content: 'A1' },
  { role: 'user', content: 'Q2' },
]

describe('anthropic', () => {
  it('streams text and sends the right request', async () => {
    const text = await collect(anthropicProvider.chat({ base, model: 'claude-x', messages: msgs, apiKey: 'sk-test' }))
    expect(text).toBe('Hello, world — ünïcode')
    expect(last!.url).toBe('/v1/messages')
    expect(last!.headers['x-api-key']).toBe('sk-test')
    expect(last!.headers['anthropic-version']).toBe('2023-06-01')
    expect(last!.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(last!.body.model).toBe('claude-x')
    expect(last!.body.stream).toBe(true)
    expect(last!.body.max_tokens).toBeGreaterThan(0)
  })

  it('moves the system prompt out of the turns', async () => {
    await collect(anthropicProvider.chat({ base, model: 'm', messages: msgs, apiKey: 'sk-test' }))
    expect(last!.body.system).toBe('You answer from notes.')
    expect(last!.body.messages.map((m: ChatMessage) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('never puts the key in the URL or body', async () => {
    await collect(anthropicProvider.chat({ base, model: 'm', messages: msgs, apiKey: 'sk-secret-123' }))
    expect(last!.url).not.toContain('sk-secret-123')
    expect(JSON.stringify(last!.body)).not.toContain('sk-secret-123')
  })

  it('surfaces a 401 with advice and the server message', async () => {
    await expect(collect(anthropicProvider.chat({ base, model: 'm', messages: msgs, apiKey: 'bad-key' }))).rejects.toThrow(/401.*check your API key.*invalid x-api-key/)
  })

  it('throws on an error event mid-stream, after yielding what it had', async () => {
    const got: string[] = []
    await expect(
      (async () => {
        for await (const p of anthropicProvider.chat({ base, model: 'm', messages: msgs, apiKey: 'overloaded' })) got.push(p)
      })(),
    ).rejects.toThrow(/Overloaded/)
    expect(got.join('')).toBe('par')
  })

  it('refuses to call out without a key', async () => {
    await expect(collect(anthropicProvider.chat({ base, model: 'm', messages: msgs }))).rejects.toThrow(/API key/)
    await expect(anthropicProvider.listModels(base, undefined, '')).rejects.toThrow(/API key/)
  })

  it('lists models', async () => {
    expect(await anthropicProvider.listModels(base, undefined, 'sk-test')).toEqual(['claude-sonnet-x', 'claude-haiku-x'])
  })
})

describe('openai-compatible', () => {
  it('streams deltas and stops at [DONE]', async () => {
    const text = await collect(openaiProvider.chat({ base, model: 'gpt-x', messages: msgs, apiKey: 'sk-test' }))
    expect(text).toBe('Hello there')
    expect(last!.url).toBe('/chat/completions')
    expect(last!.headers.authorization).toBe('Bearer sk-test')
    expect(last!.body.model).toBe('gpt-x')
    expect(last!.body.stream).toBe(true)
    expect(last!.body.messages).toHaveLength(4) // system stays inline for this API
  })

  it('works without a key (local servers)', async () => {
    await collect(openaiProvider.chat({ base, model: 'm', messages: msgs }))
    expect(last!.headers.authorization).toBeUndefined()
  })

  it('tolerates a trailing slash on the base URL', async () => {
    await collect(openaiProvider.chat({ base: base + '/', model: 'm', messages: msgs, apiKey: 'k' }))
    expect(last!.url).toBe('/chat/completions')
  })

  it('surfaces a 401', async () => {
    await expect(collect(openaiProvider.chat({ base, model: 'm', messages: msgs, apiKey: 'bad' }))).rejects.toThrow(/401.*check your API key/)
  })

  it('lists models sorted', async () => {
    expect(await openaiProvider.listModels(base, undefined, 'k')).toEqual(['alpha', 'zeta'])
  })
})

describe('readSSE', () => {
  const body = (parts: string[]) =>
    new Response(
      new ReadableStream({
        start(c) {
          const enc = new TextEncoder()
          parts.forEach(p => c.enqueue(enc.encode(p)))
          c.close()
        },
      }),
    )

  it('reassembles events split across chunks, handles CRLF, comments and multi-line data', async () => {
    const res = body(['event: a\r\nda', 'ta: {"x":1}\r\n\r\n: comment\n', 'data: l1\ndata: l2\n\n', 'data: tail-without-blank-line'])
    const out: { event: string; data: string }[] = []
    for await (const e of readSSE(res)) out.push(e)
    expect(out).toEqual([
      { event: 'a', data: '{"x":1}' },
      { event: 'message', data: 'l1\nl2' },
      { event: 'message', data: 'tail-without-blank-line' },
    ])
  })
})
