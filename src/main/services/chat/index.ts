import type { ChatEvent, ChatMessage, Settings } from '../../../shared/types'
import { parseSse } from './sse'
import { anthropicDelta, buildAnthropicRequest, buildOpenAiRequest, openaiDelta } from './providers'
import type { Delta } from './providers'
import type { SseEvent } from './sse'

const MAX_INPUT = 8000
const MAX_HISTORY_SENT = 40
const CONNECT_TIMEOUT_MS = 30_000

let history: ChatMessage[] = []
let abort: AbortController | null = null

export const getHistory = (): ChatMessage[] => history
export function newChat(): void {
  abort?.abort()
  history = []
}
export const cancelChat = (): void => abort?.abort()

/** Human-readable (Dutch) message for an HTTP failure. Never includes keys or request headers. */
async function httpError(res: Response): Promise<string> {
  let detail = ''
  try {
    const j = JSON.parse(await res.text())
    detail = String(j?.error?.message ?? j?.message ?? '').slice(0, 200)
  } catch { /* body not JSON */ }
  if (res.status === 401 || res.status === 403) return 'API-sleutel geweigerd. Controleer de sleutel in Instellingen.'
  if (res.status === 404) return `Model of endpoint niet gevonden${detail ? `: ${detail}` : ''}`
  if (res.status === 429) return 'Te veel verzoeken of tegoed op. Probeer het later opnieuw.'
  return `Fout van de API (HTTP ${res.status})${detail ? `: ${detail}` : ''}`
}

export interface ChatDeps {
  settings: Settings
  apiKey: string | null
  emit: (e: ChatEvent) => void
}

export async function sendChat(text: unknown, { settings, apiKey, emit }: ChatDeps): Promise<void> {
  const content = typeof text === 'string' ? text.trim() : ''
  if (!content) return
  if (content.length > MAX_INPUT) return emit({ type: 'error', message: 'Bericht is te lang.' })
  if (abort) return emit({ type: 'error', message: 'Er loopt al een antwoord.' })
  const { provider, model, baseUrl } = settings.chat
  if (provider === 'anthropic' && !apiKey) {
    return emit({ type: 'error', message: 'Geen API-sleutel ingesteld. Open Instellingen.' })
  }

  const turn = new AbortController()
  abort = turn
  history = [...history, { role: 'user', content }]
  const messages = history.slice(-MAX_HISTORY_SENT)
  const req = provider === 'anthropic'
    ? buildAnthropicRequest(apiKey as string, model, messages)
    : buildOpenAiRequest(baseUrl, apiKey, model, messages)
  const pick: (ev: SseEvent) => Delta = provider === 'anthropic' ? anthropicDelta : openaiDelta

  let reply = ''
  try {
    const connect = setTimeout(() => turn.abort(), CONNECT_TIMEOUT_MS)
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: turn.signal })
    clearTimeout(connect)
    if (!res.ok || !res.body) throw new Error(await httpError(res))
    outer: for await (const ev of parseSse(res.body as unknown as AsyncIterable<Uint8Array>)) {
      const d = pick(ev)
      if (d.error) throw new Error(d.error)
      if (d.text) { reply += d.text; emit({ type: 'delta', text: d.text }) }
      if (d.done) break outer
    }
    history = [...history, { role: 'assistant', content: reply }]
    emit({ type: 'done' })
  } catch (e) {
    if (turn.signal.aborted) {
      // user cancelled (or connect timeout): keep what we already streamed
      if (reply) history = [...history, { role: 'assistant', content: reply }]
      else history = history.slice(0, -1)
      emit({ type: 'done' })
    } else {
      history = history.slice(0, -1) // keep user/assistant alternation valid
      const msg = e instanceof Error && e.message && !/fetch failed/i.test(e.message)
        ? e.message
        : 'Geen verbinding met de AI-dienst.'
      emit({ type: 'error', message: msg })
    }
  } finally {
    abort = null
  }
}
