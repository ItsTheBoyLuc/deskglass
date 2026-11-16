import { describe, expect, it } from 'vitest'
import { parseSse } from '../src/main/services/chat/sse'
import { anthropicDelta, openaiDelta } from '../src/main/services/chat/providers'

async function* chunks(parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield p
}
const enc = (s: string) => new TextEncoder().encode(s)
async function collect(parts: Uint8Array[]) {
  const out: { event?: string; data: string }[] = []
  for await (const ev of parseSse(chunks(parts))) out.push(ev)
  return out
}

describe('parseSse', () => {
  it('parses events split across arbitrary chunk boundaries', async () => {
    const out = await collect([enc('event: a\ndata: {"x"'), enc(':1}\n\nevent: b\nda'), enc('ta: two\n\n')])
    expect(out).toEqual([{ event: 'a', data: '{"x":1}' }, { event: 'b', data: 'two' }])
  })
  it('handles CRLF, comments, and multi-line data', async () => {
    const out = await collect([enc(': ping\r\ndata: l1\r\ndata: l2\r\n\r\n')])
    expect(out).toEqual([{ event: undefined, data: 'l1\nl2' }])
  })
  it('does not corrupt multibyte characters split between chunks', async () => {
    const bytes = enc('data: héllo €\n\n')
    const out = await collect([bytes.slice(0, 8), bytes.slice(8)])
    expect(out[0]?.data).toBe('héllo €')
  })
  it('flushes a final event without trailing blank line', async () => {
    const out = await collect([enc('data: last')])
    expect(out).toEqual([{ event: undefined, data: 'last' }])
  })
})

describe('anthropicDelta', () => {
  it('extracts text deltas', () => {
    const ev = { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hoi' } }) }
    expect(anthropicDelta(ev)).toEqual({ text: 'Hoi' })
  })
  it('signals done on message_stop', () => {
    expect(anthropicDelta({ event: 'message_stop', data: '{"type":"message_stop"}' })).toEqual({ done: true })
  })
  it('surfaces API errors without leaking more than the message', () => {
    const ev = { event: 'error', data: JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) }
    expect(anthropicDelta(ev)).toEqual({ error: 'Overloaded' })
  })
  it('ignores pings, non-text deltas and malformed JSON', () => {
    expect(anthropicDelta({ event: 'ping', data: '{"type":"ping"}' })).toEqual({})
    expect(anthropicDelta({ event: 'content_block_delta', data: '{"delta":{"type":"input_json_delta"}}' })).toEqual({})
    expect(anthropicDelta({ event: 'x', data: '{not json' })).toEqual({})
  })
})

describe('openaiDelta', () => {
  it('extracts content deltas', () => {
    expect(openaiDelta({ data: JSON.stringify({ choices: [{ delta: { content: 'Hallo' } }] }) })).toEqual({ text: 'Hallo' })
  })
  it('signals done on [DONE]', () => {
    expect(openaiDelta({ data: '[DONE]' })).toEqual({ done: true })
  })
  it('ignores role-only chunks, empty choices and malformed JSON', () => {
    expect(openaiDelta({ data: JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }) })).toEqual({})
    expect(openaiDelta({ data: JSON.stringify({ choices: [] }) })).toEqual({})
    expect(openaiDelta({ data: 'garbage' })).toEqual({})
  })
  it('surfaces an error object', () => {
    expect(openaiDelta({ data: JSON.stringify({ error: { message: 'model not found' } }) })).toEqual({ error: 'model not found' })
  })
})
