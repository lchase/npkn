import type { ChatMessage, ChatProvider } from './provider'

export const DEFAULT_BASE = 'http://localhost:11434'

export async function listModels(base: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${base}/api/tags`, { signal })
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const data = (await res.json()) as { models: { name: string }[] }
  return data.models.map(m => m.name)
}

/** Stream assistant text from Ollama's /api/chat (newline-delimited JSON). */
export async function* chatStream(
  base: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false skips the reasoning phase on thinking models; much faster for note Q&A.
    body: JSON.stringify({ model, messages, stream: true, think: false }),
    signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Ollama ${res.status}${detail ? ': ' + detail.slice(0, 200) : ''}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const obj = JSON.parse(line) as { message?: { content?: string }; error?: string }
      if (obj.error) throw new Error(obj.error)
      if (obj.message?.content) yield obj.message.content
    }
  }
}

export const ollamaProvider: ChatProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  kind: 'local',
  needsKey: false,
  defaultBase: DEFAULT_BASE,
  listModels: (base, signal) => listModels(base, signal),
  chat: ({ base, model, messages, signal }) => chatStream(base, model, messages, signal),
}
