import { createHash, randomBytes } from 'node:crypto'

export const SPOTIFY_SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'] as const

/** Fixed loopback port. The user registers exactly http://127.0.0.1:8898/callback in the Spotify dashboard. */
export const REDIRECT_PORT = 8898
export const redirectUriFor = (port: number): string => `http://127.0.0.1:${port}/callback`

const b64url = (b: Buffer): string => b.toString('base64url')

/** RFC 7636 code verifier: 64 URL-safe chars from 48 random bytes. */
export const createVerifier = (): string => b64url(randomBytes(48))
/** Unguessable value that ties the browser callback to this connect attempt (CSRF protection). */
export const createState = (): string => b64url(randomBytes(24))
export const challengeFor = (verifier: string): string => b64url(createHash('sha256').update(verifier).digest())

export function buildAuthUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const u = new URL('https://accounts.spotify.com/authorize')
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: o.challenge,
    state: o.state,
    scope: SPOTIFY_SCOPES.join(' ')
  }).toString()
  return u.toString()
}
