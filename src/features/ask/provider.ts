export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  base: string
  model: string
  messages: ChatMessage[]
  /** Cloud providers only. Sent as a header, never in a URL, never logged. */
  apiKey?: string
  signal?: AbortSignal
}

/**
 * A chat backend. `kind` matters to the user: 'local' keeps note excerpts on this machine, 'cloud'
 * sends the question and the retrieved excerpts to a third party, and the UI says so.
 */
export interface ChatProvider {
  id: string
  label: string
  kind: 'local' | 'cloud'
  needsKey: boolean
  defaultBase: string
  listModels(base: string, signal?: AbortSignal, apiKey?: string): Promise<string[]>
  chat(opts: ChatOptions): AsyncGenerator<string>
}

/** Pull a human-readable message out of a failed response (both APIs use { error: { message } }). */
export async function failure(provider: string, res: Response): Promise<Error> {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message ?? text)
    } catch {
      detail = text
    }
  } catch {
    /* no body */
  }
  const hint = res.status === 401 || res.status === 403 ? ' (check your API key)' : ''
  return new Error(`${provider} ${res.status}${hint}${detail ? ': ' + detail.slice(0, 240) : ''}`)
}
