import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, applySettingsPatch } from '../src/shared/settings'

describe('applySettingsPatch', () => {
  it('returns a new object and leaves the base untouched', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { city: 'Groningen' })
    expect(next.city).toBe('Groningen')
    expect(DEFAULT_SETTINGS.city).not.toBe('Groningen')
    expect(next).not.toBe(DEFAULT_SETTINGS)
  })

  it('ignores unknown keys and wrong types', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { evil: 1, city: 42, locked: 'yes', clockSeconds: true } as never)
    expect(next.city).toBe(DEFAULT_SETTINGS.city)
    expect(next.locked).toBe(DEFAULT_SETTINGS.locked)
    expect(next.clockSeconds).toBe(true)
    expect((next as Record<string, unknown>).evil).toBeUndefined()
  })

  it('merges widget enabled flags per widget', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { enabled: { chat: false, bogus: true } } as never)
    expect(next.enabled.chat).toBe(false)
    expect(next.enabled.clock).toBe(DEFAULT_SETTINGS.enabled.clock)
    expect((next.enabled as Record<string, unknown>).bogus).toBeUndefined()
  })

  it('trims and length-limits the city', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { city: '  Assen  ' }).city).toBe('Assen')
    expect(applySettingsPatch(DEFAULT_SETTINGS, { city: 'x'.repeat(500) }).city.length).toBeLessThanOrEqual(80)
  })

  it('accepts only http(s) base URLs and strips trailing slashes', () => {
    const ok = applySettingsPatch(DEFAULT_SETTINGS, { chat: { baseUrl: 'http://localhost:11434/v1/' } })
    expect(ok.chat.baseUrl).toBe('http://localhost:11434/v1')
    const bad = applySettingsPatch(DEFAULT_SETTINGS, { chat: { baseUrl: 'file:///etc/passwd' } })
    expect(bad.chat.baseUrl).toBe(DEFAULT_SETTINGS.chat.baseUrl)
    const junk = applySettingsPatch(DEFAULT_SETTINGS, { chat: { baseUrl: 'javascript:alert(1)' } })
    expect(junk.chat.baseUrl).toBe(DEFAULT_SETTINGS.chat.baseUrl)
  })

  it('only accepts known providers and desktop modes', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { chat: { provider: 'openai-compat' } }).chat.provider).toBe('openai-compat')
    expect(applySettingsPatch(DEFAULT_SETTINGS, { chat: { provider: 'evil' } } as never).chat.provider).toBe(DEFAULT_SETTINGS.chat.provider)
    expect(applySettingsPatch(DEFAULT_SETTINGS, { desktopMode: 'bottom' }).desktopMode).toBe('bottom')
    expect(applySettingsPatch(DEFAULT_SETTINGS, { desktopMode: 'x' } as never).desktopMode).toBe(DEFAULT_SETTINGS.desktopMode)
  })

  it('survives a non-object patch', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS)
    expect(applySettingsPatch(DEFAULT_SETTINGS, 'x')).toEqual(DEFAULT_SETTINGS)
  })
})
