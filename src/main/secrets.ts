import type { SecretName } from '../shared/types'

/** Subset of Electron's safeStorage (async API); injectable so the logic is testable without Electron. */
export interface CryptoLike {
  isAsyncEncryptionAvailable(): Promise<boolean>
  encryptStringAsync(plain: string): Promise<Buffer>
  decryptStringAsync(cipher: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}
export interface KV {
  get(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

const NAMES: readonly SecretName[] = ['chatApiKey', 'compatApiKey', 'icsUrl', 'spotifyRefreshToken']
const MAX_LEN = 4096

/**
 * Secrets are encrypted with the OS (DPAPI via safeStorage) and stored as base64 ciphertext.
 * There is deliberately no plaintext fallback. Values are never logged or included in error text.
 */
export function createSecrets(crypto: CryptoLike, kv: KV) {
  const assertName = (name: string): void => {
    if (!NAMES.includes(name as SecretName)) throw new Error('Onbekend geheim')
  }
  async function set(name: SecretName, value: string): Promise<void> {
    assertName(name)
    if (value === '') { kv.delete(name); return }
    if (value.length > MAX_LEN) throw new Error('Waarde is te lang')
    if (!(await crypto.isAsyncEncryptionAvailable())) throw new Error('Veilige opslag (versleuteling) is niet beschikbaar op dit systeem')
    kv.set(name, (await crypto.encryptStringAsync(value)).toString('base64'))
  }
  return {
    set,
    async get(name: SecretName): Promise<string | null> {
      assertName(name)
      const raw = kv.get(name)
      if (!raw) return null
      try {
        const { result, shouldReEncrypt } = await crypto.decryptStringAsync(Buffer.from(raw, 'base64'))
        if (shouldReEncrypt) await set(name, result).catch(() => {}) // key rotated: refresh ciphertext, best effort
        return result
      } catch {
        return null // other user/machine or corrupted: treat as not set
      }
    },
    has(name: SecretName): boolean {
      assertName(name)
      return Boolean(kv.get(name))
    }
  }
}
