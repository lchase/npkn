import { failure, type ChatProvider, type ChatOptions } from './provider'
import { readSSE } from './sse'

const VERSION = '2023-06-01'
const MAX_TOKENS = 2000

/**
 * Anthropic's Messages API, called straight from the browser with the user's own key.
 * `anthropic-dangerous-direct-browser-access` is Anthropic's explicit opt-in for exactly this case;
 * the "dangerous" is about shipping a shared key in a bundle, not about a user's own key.
 */
const headers = (apiKey: string) => ({
  'x-api-key': apiKey,
  'anthropic-version': VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
  'content-type': 'application/json',
})

async function listModels(base: string, signal?: AbortSignal, apiKey = ''): Promise<string[]> {
  if (!apiKey) throw new Error('Add an Anthropic API key first')
  const res = await fetch(`${base}/v1/models?limit=100`, { headers: headers(apiKey), signal })
  if (!res.ok) throw await failure('Anthropic', res)
  const data = (await res.json()) as { data: { id: string }[] }
  return data.data.map(m => m.id)
}

async function* chat({ base, model, messages, apiKey = '', signal }: ChatOptions): AsyncGenerator<string> {
  if (!apiKey) throw new Error('Add an Anthropic API key in Settings')
  // The API takes the system prompt separately from the turns.
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const turns = messages.filter(m => m.role !== 'system')

  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, stream: true, system, messages: turns }),
    signal,
  })
  if (!res.ok) throw await failure('Anthropic', res)

  for await (const ev of readSSE(res)) {
    let obj: any
    try {
      obj = JSON.parse(ev.data)
    } catch {
      continue
    }
    if (ev.event === 'error' || obj.type === 'error') throw new Error(`Anthropic: ${obj.error?.message ?? 'stream error'}`)
    if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && obj.delta.text) yield obj.delta.text as string
    if (obj.type === 'message_stop') return
  }
}

export const anthropicProvider: ChatProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  kind: 'cloud',
  needsKey: true,
  defaultBase: 'https://api.anthropic.com',
  listModels,
  chat,
}
