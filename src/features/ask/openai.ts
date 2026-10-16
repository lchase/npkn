import { failure, type ChatProvider, type ChatOptions } from './provider'
import { readSSE } from './sse'

/**
 * Any OpenAI-compatible chat endpoint: OpenAI itself, routers such as OpenRouter, or a local server
 * like LM Studio. Only the base URL and key differ.
 */
const headers = (apiKey: string) => ({
  'content-type': 'application/json',
  ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
})

const trim = (s: string) => s.replace(/\/+$/, '')

async function listModels(base: string, signal?: AbortSignal, apiKey = ''): Promise<string[]> {
  const res = await fetch(`${trim(base)}/models`, { headers: headers(apiKey), signal })
  if (!res.ok) throw await failure('Provider', res)
  const data = (await res.json()) as { data?: { id: string }[] }
  return (data.data ?? []).map(m => m.id).sort()
}

async function* chat({ base, model, messages, apiKey = '', signal }: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${trim(base)}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })
  if (!res.ok) throw await failure('Provider', res)

  for await (const ev of readSSE(res)) {
    if (ev.data === '[DONE]') return
    let obj: any
    try {
      obj = JSON.parse(ev.data)
    } catch {
      continue
    }
    if (obj.error) throw new Error(`Provider: ${obj.error.message ?? 'stream error'}`)
    const piece = obj.choices?.[0]?.delta?.content
    if (typeof piece === 'string' && piece) yield piece
  }
}

export const openaiProvider: ChatProvider = {
  id: 'openai',
  label: 'OpenAI-compatible',
  kind: 'cloud',
  needsKey: true,
  defaultBase: 'https://api.openai.com/v1',
  listModels,
  chat,
}

/** Base URLs worth offering as one-click presets. */
export const OPENAI_PRESETS = [
  { label: 'OpenAI', base: 'https://api.openai.com/v1' },
  { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1' },
  { label: 'LM Studio (local)', base: 'http://localhost:1234/v1' },
]
