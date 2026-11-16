import { h, frame } from '../dom'
import type { Mount } from '../dom'
import type { ChatEvent, ChatMessage } from '../../shared/types'

export const mountChat: Mount = (root, ctx) => {
  const newBtn = h('button', { text: 'Nieuwe chat', title: 'Begin een nieuw gesprek' })
  const { el, body, dot } = frame('AI-chat', { extra: newBtn })
  root.append(el)

  const messages = h('div', { class: 'messages', role: 'log', 'aria-live': 'polite' })
  const hint = h('div', { class: 'hint' })
  const input = h('textarea', { placeholder: 'Typ een bericht… (Enter = versturen)', maxLength: 8000, 'aria-label': 'Bericht' })
  const send = h('button', { text: 'Stuur' })
  body.append(hint, messages, h('div', { class: 'composer' }, input, send))

  let streaming = false
  let bubble: HTMLElement | null = null
  const scroll = (): void => { messages.scrollTop = messages.scrollHeight }
  const addMsg = (role: 'user' | 'assistant' | 'err', text: string): HTMLElement => {
    const m = h('div', { class: `msg ${role === 'user' ? 'user' : role === 'err' ? 'err' : ''}`, text })
    messages.append(m)
    scroll()
    return m
  }
  const setStreaming = (on: boolean): void => {
    streaming = on
    send.textContent = on ? 'Stop' : 'Stuur'
    dot.className = on ? 'dot' : 'dot off'
  }
  const renderHint = (): void => {
    const { chat } = ctx.state().settings
    const noKey = chat.provider === 'anthropic' && !ctx.state().has.chatApiKey
    hint.textContent = noKey ? 'Geen API-sleutel: open Instellingen → AI.' : `${chat.provider === 'anthropic' ? 'Anthropic' : 'Eigen endpoint'} · ${chat.model}`
  }

  ctx.api.onChat((e: ChatEvent) => {
    if (e.type === 'delta') {
      bubble ??= addMsg('assistant', '')
      bubble.textContent += e.text
      scroll()
    } else {
      if (e.type === 'error') addMsg('err', e.message)
      bubble = null
      setStreaming(false)
    }
  })

  const submit = (): void => {
    if (streaming) { ctx.api.chatCancel(); return }
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    addMsg('user', text)
    bubble = null
    setStreaming(true)
    ctx.api.chatSend(text).catch(() => { addMsg('err', 'Versturen mislukt.'); setStreaming(false) })
  }
  send.addEventListener('click', submit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  })
  newBtn.addEventListener('click', () => {
    void ctx.api.chatNew().then(() => { messages.replaceChildren(); bubble = null; setStreaming(false) })
  })

  ctx.onState(renderHint)
  renderHint()
  void ctx.api.chatHistory().then((hist: ChatMessage[]) => hist.forEach((m) => addMsg(m.role, m.content)))
}
