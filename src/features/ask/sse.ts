/** Server-sent events: yields { event, data } for each message in a streamed response body. */
export async function* readSSE(res: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let event = ''
  let data: string[] = []

  const flush = function* () {
    if (data.length) yield { event: event || 'message', data: data.join('\n') }
    event = ''
    data = []
  }

  const handle = function* (raw: string) {
    const line = raw.replace(/\r$/, '')
    if (line === '') yield* flush()
    else if (line.startsWith(':')) return // comment / keep-alive
    else if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      yield* handle(line)
    }
  }
  // A stream may end without a final newline; don't lose the last line.
  buf += decoder.decode()
  if (buf) yield* handle(buf)
  yield* flush()
}
