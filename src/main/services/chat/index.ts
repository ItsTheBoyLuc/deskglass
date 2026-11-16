import type { ChatEvent, ChatMessage, Settings } from '../../../shared/types'
import { parseSse } from './sse'
import { anthropicDelta, buildAnthropicRequest, buildOpenAiRequest, keyTransportAllowed, openaiDelta } from './providers'
import type { Delta } from './providers'
import type { SseEvent } from './sse'

const MAX_INPUT = 8000
const MAX_HISTORY_SENT = 40
const MAX_HISTORY_KEPT = 200
const MAX_REPLY_CHARS = 200_000
const DEFAULT_TIMEOUTS = { connect: 30_000, idle: 60_000 }

let history: ChatMessage[] = []
let abort: AbortController | null = null
/** Bumped by newChat(): a turn that started in an older generation must not write history. */
let generation = 0

export const getHistory = (): ChatMessage[] => history
export function newChat(): void {
  generation++
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
  fetchImpl?: typeof fetch
  timeouts?: { connect: number; idle: number }
}

export async function sendChat(text: unknown, deps: ChatDeps): Promise<void> {
  const { settings, apiKey, emit, fetchImpl = fetch, timeouts = DEFAULT_TIMEOUTS } = deps
  const content = typeof text === 'string' ? text.trim() : ''
  if (!content) return
  if (content.length > MAX_INPUT) return emit({ type: 'error', message: 'Bericht is te lang.' })
  if (abort) return emit({ type: 'error', message: 'Er loopt al een antwoord.' })
  const { provider, model, baseUrl } = settings.chat
  if (provider === 'anthropic' && !apiKey) return emit({ type: 'error', message: 'Geen API-sleutel ingesteld. Open Instellingen.' })
  if (provider === 'openai-compat' && apiKey && !keyTransportAllowed(baseUrl)) {
    return emit({ type: 'error', message: 'Een API-sleutel wordt alleen via https of naar localhost verstuurd.' })
  }

  const gen = generation
  const turn = new AbortController()
  abort = turn
  const before = history
  const withUser: ChatMessage[] = [...before, { role: 'user', content }]
  history = withUser
  const messages = withUser.slice(-MAX_HISTORY_SENT)
  const req = provider === 'anthropic'
    ? buildAnthropicRequest(apiKey as string, model, messages)
    : buildOpenAiRequest(baseUrl, apiKey, model, messages)
  const pick: (ev: SseEvent) => Delta = provider === 'anthropic' ? anthropicDelta : openaiDelta

  /** Write the outcome of this turn, unless "new chat" happened meanwhile. Empty reply = roll the user turn back. */
  const commit = (reply: string): void => {
    if (gen !== generation) return
    history = reply ? [...withUser, { role: 'assistant' as const, content: reply }].slice(-MAX_HISTORY_KEPT) : before
  }

  let reply = ''
  let timedOut = false
  let timer: NodeJS.Timeout | undefined
  const arm = (ms: number): void => {
    clearTimeout(timer)
    timer = setTimeout(() => { timedOut = true; turn.abort() }, ms)
  }
  try {
    arm(timeouts.connect)
    const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: turn.signal, redirect: 'error' })
    if (!res.ok || !res.body) throw new Error(await httpError(res))
    for await (const ev of parseSse(res.body as unknown as AsyncIterable<Uint8Array>)) {
      arm(timeouts.idle)
      const d = pick(ev)
      if (d.error) throw new Error(d.error)
      if (d.text) {
        reply += d.text
        emit({ type: 'delta', text: d.text })
        if (reply.length > MAX_REPLY_CHARS) break // runaway endpoint: keep what we have
      }
      if (d.done) break
    }
    if (!reply) {
      commit('')
      emit({ type: 'error', message: 'Leeg antwoord ontvangen van de AI-dienst.' })
    } else {
      commit(reply)
      emit({ type: 'done' })
    }
  } catch (e) {
    commit('') // failed or timed out: roll back the user turn (partial text is not stored)
    if (timedOut) emit({ type: 'error', message: 'Time-out: de AI-dienst reageert niet meer.' })
    else if (turn.signal.aborted) {
      // user cancelled (or "new chat"): keep what was already streamed
      if (reply) commit(reply)
      emit({ type: 'done' })
    } else {
      const msg = e instanceof Error && e.message && !/fetch failed|redirect/i.test(e.message)
        ? e.message
        : 'Geen verbinding met de AI-dienst.'
      emit({ type: 'error', message: msg })
    }
  } finally {
    clearTimeout(timer)
    if (abort === turn) abort = null
  }
}
