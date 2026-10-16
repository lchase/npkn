import { anthropicProvider } from './anthropic'
import { ollamaProvider } from './ollama'
import { openaiProvider } from './openai'
import type { ChatProvider } from './provider'

export type ProviderId = 'ollama' | 'anthropic' | 'openai'

export const PROVIDERS: Record<ProviderId, ChatProvider> = {
  ollama: ollamaProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
}

export const PROVIDER_ORDER: ProviderId[] = ['ollama', 'anthropic', 'openai']
