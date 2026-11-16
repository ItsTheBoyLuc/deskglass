export interface SseEvent { event?: string; data: string }

const BOUNDARY = /\r\n\r\n|\n\n|\r\r/

/** Minimal Server-Sent-Events parser over a byte stream (fetch body). Handles CRLF, comments, split chunks. */
export async function* parseSse(stream: AsyncIterable<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })
    let m: RegExpExecArray | null
    while ((m = BOUNDARY.exec(buffer))) {
      const raw = buffer.slice(0, m.index)
      buffer = buffer.slice(m.index + m[0].length)
      const ev = parseBlock(raw)
      if (ev) yield ev
    }
  }
  buffer += decoder.decode()
  const last = parseBlock(buffer)
  if (last) yield last
}

function parseBlock(block: string): SseEvent | null {
  let event: string | undefined
  const data: string[] = []
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event, data: data.join('\n') } : null
}
