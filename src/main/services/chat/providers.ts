import type { ChatMessage } from '../../../shared/types'
import type { SseEvent } from './sse'

/** Result of interpreting one SSE event. Empty object = ignore. */
export interface Delta { text?: string; done?: boolean; error?: string }

function safeJson(s: string): Record<string, any> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

export function anthropicDelta(ev: SseEvent): Delta {
  const j = safeJson(ev.data)
  if (!j) return {}
  const type = ev.event ?? j.type
  if (type === 'content_block_delta' && j.delta?.type === 'text_delta' && typeof j.delta.text === 'string') return { text: j.delta.text }
  if (type === 'message_stop') return { done: true }
  if (type === 'error') return { error: String(j.error?.message ?? 'Onbekende fout van de API') }
  return {}
}

export function openaiDelta(ev: SseEvent): Delta {
  if (ev.data.trim() === '[DONE]') return { done: true }
  const j = safeJson(ev.data)
  if (!j) return {}
  if (j.error) return { error: String(j.error.message ?? 'Onbekende fout van de API') }
  const content = j.choices?.[0]?.delta?.content
  return typeof content === 'string' && content ? { text: content } : {}
}

/** A key may only travel over https, or over plain http to this machine (e.g. Ollama on localhost). */
export function keyTransportAllowed(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl)
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

export interface RequestSpec { url: string; headers: Record<string, string>; body: string }

export function buildAnthropicRequest(apiKey: string, model: string, messages: ChatMessage[]): RequestSpec {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 2048, stream: true, messages })
  }
}

export function buildOpenAiRequest(baseUrl: string, apiKey: string | null, model: string, messages: ChatMessage[]): RequestSpec {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  return { url: `${baseUrl}/chat/completions`, headers, body: JSON.stringify({ model, stream: true, messages }) }
}
