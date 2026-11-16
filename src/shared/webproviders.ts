import type { WebProvider } from './types'

/**
 * The embedded web-chat may only navigate within the chosen provider's own domains. Everything else opens in the
 * system browser. (No OAuth, no token or cookie handling by us: the user logs in on the site itself.)
 */
export const PROVIDERS: Record<WebProvider, { label: string; url: string; hosts: readonly string[] }> = {
  claude: { label: 'Claude', url: 'https://claude.ai/', hosts: ['claude.ai', 'anthropic.com'] },
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/', hosts: ['chatgpt.com', 'openai.com'] },
  // Google sign-in lives on accounts.google.com; Google often refuses it inside embedded browsers.
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/', hosts: ['gemini.google.com', 'accounts.google.com'] }
}

/** True for https URLs whose host is a provider domain or a subdomain of it (look-alike hosts are rejected). */
export function isAllowedNavigation(provider: WebProvider, raw: string): boolean {
  const p = PROVIDERS[provider]
  if (!p) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  return p.hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
}

/**
 * Remote chat pages may only WRITE to the clipboard (copy buttons), and only the provider's own origin may ask.
 * Reading the clipboard needs no permission for Ctrl+V; camera, mic, location, notifications... are always denied,
 * and so is everything requested by third-party frames (captcha, ads, payment widgets).
 */
export const isPermissionAllowed = (permission: string, provider: WebProvider, requestingUrl: string): boolean =>
  permission === 'clipboard-sanitized-write' && isAllowedNavigation(provider, requestingUrl)

/** A normal Chrome UA (no "Electron/..." token), because some sites block or degrade unknown clients. */
export const chromeUserAgent = (chromeVersion: string): string =>
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
