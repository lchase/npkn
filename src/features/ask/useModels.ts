import { useEffect, useState } from 'react'
import { activeProvider, setAiConfig, type ActiveProvider } from './config'
import type { ProviderId } from './providers'

/** A sensible default so the first question works without opening a model picker. */
export function pickDefaultModel(provider: ProviderId, models: string[]): string {
  if (!models.length) return ''
  if (provider === 'anthropic') return models.find(m => /sonnet/i.test(m)) ?? models[0]
  if (provider === 'openai') return models.find(m => /^gpt-4o-mini$/.test(m)) ?? models.find(m => /mini/i.test(m)) ?? models[0]
  if (provider === 'ollama') {
    // Small and fast first: measured on the sample notebook, these answered as accurately as a 27B model
    // in a fraction of the time (see CLAUDE.md, "Choosing a local model").
    for (const pref of ['qwen3.5:4b', 'gemma4:e4b', 'granite4:3b', 'qwen3.5:9b', 'qwen3:8b', 'llama3.2:3b']) {
      const hit = models.find(m => m === pref || m.startsWith(pref + '-'))
      if (hit) return hit
    }
  }
  return models[0]
}

/**
 * The models the active provider offers. Doesn't call out until the provider has what it needs
 * (a key, for cloud ones), so nothing is sent to a vendor before the user has set it up.
 */
export function useModels(active: ActiveProvider) {
  const [state, setState] = useState<{ models: string[]; error: string; loading: boolean }>({ models: [], error: '', loading: false })
  const attempt = !active.provider.needsKey || !!active.apiKey

  useEffect(() => {
    if (!attempt) {
      setState({ models: [], error: '', loading: false })
      return
    }
    const ac = new AbortController()
    setState(s => ({ ...s, loading: true, error: '' }))
    active.provider
      .listModels(active.base, ac.signal, active.apiKey)
      .then(models => {
        setState({ models, error: '', loading: false })
        // Keep the saved model if it's still offered, otherwise choose a default.
        const cur = activeProvider()
        if (!cur.model || !models.includes(cur.model)) {
          const id = cur.provider.id as ProviderId
          setAiConfig({ [id]: { model: pickDefaultModel(id, models) } })
        }
      })
      .catch(e => {
        if (!ac.signal.aborted) setState({ models: [], error: (e as Error).message, loading: false })
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.provider.id, active.base, active.apiKey, attempt])

  return state
}
