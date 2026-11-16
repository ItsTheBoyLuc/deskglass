import { describe, expect, it } from 'vitest'
import { PROVIDERS, chromeUserAgent, isAllowedNavigation, isPermissionAllowed } from '../src/shared/webproviders'

describe('isAllowedNavigation', () => {
  it('allows the chosen provider (https, exact host or subdomain)', () => {
    expect(isAllowedNavigation('claude', 'https://claude.ai/chat/abc')).toBe(true)
    expect(isAllowedNavigation('claude', 'https://login.claude.ai/')).toBe(true)
    expect(isAllowedNavigation('chatgpt', 'https://chatgpt.com/')).toBe(true)
    expect(isAllowedNavigation('chatgpt', 'https://auth.openai.com/authorize?x=1')).toBe(true)
    expect(isAllowedNavigation('gemini', 'https://gemini.google.com/app')).toBe(true)
    expect(isAllowedNavigation('gemini', 'https://accounts.google.com/signin')).toBe(true)
  })
  it('blocks other providers and unrelated sites', () => {
    expect(isAllowedNavigation('claude', 'https://chatgpt.com/')).toBe(false)
    expect(isAllowedNavigation('gemini', 'https://www.google.com/')).toBe(false)
    expect(isAllowedNavigation('claude', 'https://example.com/')).toBe(false)
  })
  it('is not fooled by look-alike hosts or userinfo tricks', () => {
    expect(isAllowedNavigation('claude', 'https://claude.ai.evil.com/')).toBe(false)
    expect(isAllowedNavigation('claude', 'https://evilclaude.ai/')).toBe(false)
    expect(isAllowedNavigation('claude', 'https://claude.ai@evil.com/')).toBe(false)
    expect(isAllowedNavigation('claude', 'https://evil.com/?u=https://claude.ai/')).toBe(false)
  })
  it('requires https and rejects dangerous or malformed URLs', () => {
    for (const u of ['http://claude.ai/', 'javascript:alert(1)', 'file:///c:/x', 'data:text/html,hi', 'about:blank', '', 'not a url']) {
      expect(isAllowedNavigation('claude', u), u).toBe(false)
    }
  })
  it('only knows the three providers', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(['chatgpt', 'claude', 'gemini'])
    expect(isAllowedNavigation('evil' as never, 'https://claude.ai/')).toBe(false)
  })
})

describe('permissions and user agent', () => {
  it('allows only clipboard permissions', () => {
    expect(isPermissionAllowed('clipboard-sanitized-write')).toBe(true)
    expect(isPermissionAllowed('clipboard-read')).toBe(true)
    for (const p of ['media', 'geolocation', 'notifications', 'midi', 'openExternal', 'fullscreen', 'display-capture']) expect(isPermissionAllowed(p), p).toBe(false)
  })
  it('builds a normal Chrome user agent without the Electron token', () => {
    const ua = chromeUserAgent('130.0.6723.91')
    expect(ua).toContain('Chrome/130.0.6723.91')
    expect(ua).toContain('Windows NT 10.0')
    expect(ua).not.toMatch(/Electron|DeskGlass/i)
  })
})
