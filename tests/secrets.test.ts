import { describe, expect, it } from 'vitest'
import { createSecrets } from '../src/main/secrets'
import type { CryptoLike, KV } from '../src/main/secrets'

const rev = (b: Uint8Array) => Buffer.from([...b].reverse())
const fakeCrypto = (available = true): CryptoLike => ({
  isAsyncEncryptionAvailable: async () => available,
  encryptStringAsync: async (s) => rev(Buffer.from(s, 'utf8')),
  decryptStringAsync: async (b) => ({ result: rev(b).toString('utf8'), shouldReEncrypt: false })
})

const memoryKv = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {}
  return {
    data,
    get: (k) => data[k],
    set: (k, v) => void (data[k] = v),
    delete: (k) => void delete data[k]
  }
}

describe('secrets', () => {
  it('round-trips a value and never stores plaintext', async () => {
    const kv = memoryKv()
    const s = createSecrets(fakeCrypto(), kv)
    await s.set('chatApiKey', 'sk-ant-secret')
    expect(await s.get('chatApiKey')).toBe('sk-ant-secret')
    expect(s.has('chatApiKey')).toBe(true)
    expect(JSON.stringify(kv.data)).not.toContain('sk-ant-secret')
  })

  it('refuses to save (no plaintext fallback) when encryption is unavailable', async () => {
    const kv = memoryKv()
    const s = createSecrets(fakeCrypto(false), kv)
    await expect(s.set('chatApiKey', 'x')).rejects.toThrow(/versleuteling/i)
    expect(kv.data).toEqual({})
  })

  it('returns null instead of throwing when the ciphertext cannot be decrypted', async () => {
    const kv = memoryKv()
    kv.set('icsUrl', 'bm90LXZhbGlk')
    const bad: CryptoLike = { ...fakeCrypto(), decryptStringAsync: async () => { throw new Error('bad') } }
    expect(await createSecrets(bad, kv).get('icsUrl')).toBeNull()
  })

  it('re-encrypts when the OS says the key rotated', async () => {
    const kv = memoryKv()
    const plain = fakeCrypto()
    await createSecrets(plain, kv).set('icsUrl', 'https://x')
    const before = kv.data.icsUrl
    const rotating: CryptoLike = {
      ...plain,
      encryptStringAsync: async (s) => Buffer.from(`new:${s}`),
      decryptStringAsync: async (b) => ({ result: rev(b).toString('utf8'), shouldReEncrypt: true })
    }
    expect(await createSecrets(rotating, kv).get('icsUrl')).toBe('https://x')
    expect(kv.data.icsUrl).not.toBe(before)
  })

  it('clears a secret, and an empty value clears too', async () => {
    const kv = memoryKv()
    const s = createSecrets(fakeCrypto(), kv)
    await s.set('icsUrl', 'https://x')
    await s.set('icsUrl', '')
    expect(s.has('icsUrl')).toBe(false)
    expect(await s.get('icsUrl')).toBeNull()
  })

  it('rejects unknown secret names and oversized values', async () => {
    const s = createSecrets(fakeCrypto(), memoryKv())
    await expect(s.set('other' as never, 'x')).rejects.toThrow()
    await expect(s.set('chatApiKey', 'x'.repeat(5000))).rejects.toThrow()
  })
})
