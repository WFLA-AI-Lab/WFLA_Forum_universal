/**
 * Builds an idempotency key for chat sends.
 *
 * `crypto.randomUUID()` is unavailable in some browsers when the forum is
 * opened over plain HTTP. `getRandomValues()` remains suitable for generating
 * the non-secret client id, so use it to construct an RFC 4122 v4 UUID when
 * the convenience API is missing.
 */
export function createClientId(): string {
  const browserCrypto = (globalThis as typeof globalThis & {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (target: Uint8Array) => Uint8Array;
    };
  }).crypto;
  if (typeof browserCrypto?.randomUUID === 'function') return browserCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof browserCrypto?.getRandomValues === 'function') {
    browserCrypto.getRandomValues(bytes);
  } else {
    // Extremely old browsers may not expose Web Crypto at all. This value is
    // only a message de-duplication key; authentication never depends on it.
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
