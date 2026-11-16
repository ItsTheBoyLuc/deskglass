import { nativeImage } from 'electron'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Cover art only ever comes from Spotify's own CDN hosts, over https. */
export function isSpotifyImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && (u.hostname === 'i.scdn.co' || u.hostname.endsWith('.scdn.co') || u.hostname.endsWith('.spotifycdn.com'))
  } catch {
    return false
  }
}

export interface Art { dataUrl: string; accent: [number, number, number] | null }
let cached: { url: string; art: Art | null; at: number } | null = null
const RETRY_AFTER_FAILURE_MS = 30_000

/**
 * Cover art is fetched here (main) and handed to the renderer as a data: URI, so the renderer's CSP can stay
 * `img-src 'self' data:` and never talks to the network. The accent colour is the image's average colour.
 */
export async function loadArt(url: string | null): Promise<Art | null> {
  if (!url || !isSpotifyImageUrl(url)) return null
  if (cached?.url === url && (cached.art || Date.now() - cached.at < RETRY_AFTER_FAILURE_MS)) return cached.art
  let art: Art | null = null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('too large')
    const buf = Buffer.from(await res.arrayBuffer())
    if (res.ok && TYPES.has(type) && buf.byteLength <= MAX_BYTES) {
      const img = nativeImage.createFromBuffer(buf)
      let accent: Art['accent'] = null
      if (!img.isEmpty()) {
        const px = img.resize({ width: 1, height: 1, quality: 'good' }).toBitmap() // BGRA
        accent = [px[2] ?? 0, px[1] ?? 0, px[0] ?? 0]
      }
      art = { dataUrl: `data:${type};base64,${buf.toString('base64')}`, accent }
    }
  } catch {
    art = null
  }
  cached = { url, art, at: Date.now() }
  return art
}
