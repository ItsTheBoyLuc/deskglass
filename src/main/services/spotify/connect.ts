import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { REDIRECT_PORT, buildAuthUrl, challengeFor, createState, createVerifier, redirectUriFor } from './pkce'

export type FlowResult = { ok: true } | { ok: false; error: string }

export interface FlowOptions {
  clientId: string
  /** Opens the authorize URL in the system browser. */
  openUrl: (url: string) => void
  /** Trades the authorization code for tokens (see tokens.ts). */
  exchange: (code: string, verifier: string, redirectUri: string) => Promise<FlowResult>
  port?: number
  timeoutMs?: number
}

// Static pages only: nothing from the request is ever reflected into HTML.
const page = (title: string, text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>DeskGlass</title><body style="font:16px Segoe UI,sans-serif;background:#16181d;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div><h2>${title}</h2><p>${text}</p></div></body>`

/**
 * Authorization Code + PKCE against a one-shot loopback server on 127.0.0.1 only (never localhost, never https).
 * The callback is accepted once, only on /callback, only with the state we generated.
 */
export function runAuthFlow(opts: FlowOptions): Promise<FlowResult> {
  const { clientId, openUrl, exchange, port = REDIRECT_PORT, timeoutMs = 180_000 } = opts
  const verifier = createVerifier()
  const state = createState()

  return new Promise((resolve) => {
    let settled = false
    let redirectUri = ''
    let exchanging = false
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (settled || exchanging || req.method !== 'GET' || url.pathname !== '/callback') { res.writeHead(404).end(); return }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('Ongeldig verzoek', 'Start het verbinden opnieuw vanuit DeskGlass.'))
        return // keep waiting: a stray request must not abort the real flow
      }
      const code = url.searchParams.get('code')
      if (url.searchParams.get('error') || !code) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Niet verbonden', 'Je hebt geen toegang gegeven. Je kunt dit venster sluiten.'))
        finish({ ok: false, error: 'Toegang tot Spotify is geweigerd.' })
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Verbonden met Spotify', 'Je kunt dit venster sluiten en terug naar DeskGlass gaan.'))
      exchanging = true // a reload of the callback page must not replay a burned code
      exchange(code, verifier, redirectUri).then(finish, () => finish({ ok: false, error: 'Verbinden met Spotify mislukt.' }))
    })

    const timer = setTimeout(() => finish({ ok: false, error: 'Time-out: het verbinden met Spotify is niet afgerond.' }), timeoutMs)
    function finish(r: FlowResult): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      setTimeout(() => server.closeAllConnections(), 250).unref() // let the browser finish reading the page
      resolve(r)
    }

    server.on('error', (e: NodeJS.ErrnoException) => finish({
      ok: false,
      error: e.code === 'EADDRINUSE'
        ? `Poort ${port} is bezet. Sluit het programma dat die poort gebruikt en probeer opnieuw.`
        : 'Kon de lokale callback-server niet starten.'
    }))
    server.listen(port, '127.0.0.1', () => {
      redirectUri = redirectUriFor((server.address() as AddressInfo).port)
      openUrl(buildAuthUrl({ clientId, redirectUri, challenge: challengeFor(verifier), state }))
    })
  })
}
