import { randomBytes, timingSafeEqual } from 'node:crypto';

const QUOTA = 120;
const WINDOW_SECONDS = 60;

interface Bucket {
  count: number;
  expiresAt: number;
}

const buckets = new Map<string, Bucket>();

export async function enforceRateLimit(key: string): Promise<void> {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > QUOTA) {
    const seconds = Math.ceil((bucket.expiresAt - now) / 1000);
    throw Object.assign(new Error(`Rate limit exceeded. Retry in ${seconds}s`), { status: 429 });
  }
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}
