import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelChat, getHistory, newChat, sendChat } from '../src/main/services/chat'
import { keyTransportAllowed } from '../src/main/services/chat/providers'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { ChatEvent, Settings } from '../src/shared/types'

const compat: Settings = { ...DEFAULT_SETTINGS, chat: { provider: 'openai-compat', model: 'm', baseUrl: 'http://127.0.0.1:9/v1' } }
const enc = new TextEncoder()
const delta = (t: string) => enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)
const DONE = enc.encode('data: [DONE]\n\n')

/** A streaming Response the test controls chunk by chunk. */
function gated(status = 200) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctl = c) })
  const serve = (async (_u: unknown, init?: RequestInit) => {
    // like a real fetch body: aborting the request errors the stream
    init?.signal?.addEventListener("abort", () => { try { ctl.error(new DOMException("Aborted", "AbortError")) } catch { /* already closed */ } })
    return new Response(body, { status })
  }) as unknown as typeof fetch
  return { serve, push: (b: Uint8Array) => ctl.enqueue(b), end: () => ctl.close() }
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

function run(fetchImpl: typeof fetch, text = 'hoi', settings = compat, apiKey: string | null = null, timeouts?: { connect: number; idle: number }) {
  const events: ChatEvent[] = []
  const done = sendChat(text, { settings, apiKey, emit: (e) => events.push(e), fetchImpl, timeouts })
  return { events, done }
}

beforeEach(() => newChat())

describe('sendChat history integrity', () => {
  it('"new chat" during a stream does not leave a dangling assistant message (regression)', async () => {
    const g = gated()
    const { done } = run(g.serve)
    await tick()
    g.push(delta('x'))
    await tick()
    newChat() // aborts the in-flight request
    await done
    expect(getHistory()).toEqual([])
  })

  it('stores user + assistant on a normal reply', async () => {
    const g = gated()
    const { events, done } = run(g.serve)
    await tick()
    g.push(delta('Hal')); g.push(delta('lo')); g.push(DONE); g.end()
    await done
    expect(getHistory()).toEqual([{ role: 'user', content: 'hoi' }, { role: 'assistant', content: 'Hallo' }])
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('drops the user turn and reports an error on an empty reply', async () => {
    const g = gated()
    const { events, done } = run(g.serve)
    await tick()
    g.push(DONE); g.end()
    await done
    expect(getHistory()).toEqual([])
    expect(events.at(-1)?.type).toBe('error')
  })

  it('keeps the partial reply when the user cancels', async () => {
    const g = gated()
    const { done } = run(g.serve)
    await tick()
    g.push(delta('half'))
    await tick()
    cancelChat()
    await done
    expect(getHistory()).toEqual([{ role: 'user', content: 'hoi' }, { role: 'assistant', content: 'half' }])
  })

  it('removes the user turn after an HTTP error and never leaks the key', async () => {
    const { events, done } = run(async () => new Response('{"error":{"message":"nope"}}', { status: 500 }), 'hoi', compat, 'sk-secret-xyz')
    await done
    expect(getHistory()).toEqual([])
    expect(JSON.stringify(events)).not.toContain('sk-secret-xyz')
    expect(events.at(-1)?.type).toBe('error')
  })

  it('reports a time-out when the stream stalls (idle timeout)', async () => {
    const g = gated()
    const { events, done } = run(g.serve, 'hoi', compat, null, { connect: 500, idle: 30 })
    await tick()
    g.push(delta('x'))
    await done
    const last = events.at(-1)
    expect(last?.type).toBe('error')
    expect(getHistory()).toEqual([])
  })
})

describe('API key transport', () => {
  it.each([
    ['https://api.example.com/v1', true],
    ['http://localhost:11434/v1', true],
    ['http://127.0.0.1:8080/v1', true],
    ['http://[::1]:8080/v1', true],
    ['http://example.com/v1', false],
    ['http://192.168.1.20:11434/v1', false]
  ])('%s -> %s', (url, ok) => {
    expect(keyTransportAllowed(url)).toBe(ok)
  })

  it('refuses to send a key to a plain-http remote host', async () => {
    const fetchImpl = vi.fn()
    const { events, done } = run(fetchImpl as unknown as typeof fetch, 'hoi', { ...compat, chat: { ...compat.chat, baseUrl: 'http://example.com/v1' } }, 'sk-x')
    await done
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(events.at(-1)?.type).toBe('error')
    expect(getHistory()).toEqual([])
  })
})
