import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientId } from '../frontend/src/client-id';

afterEach(() => vi.unstubAllGlobals());

describe('chat client id', () => {
  it('uses the native random UUID API when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'native-id' });
    expect(createClientId()).toBe('native-id');
  });

  it('builds a UUID with getRandomValues when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (target: Uint8Array) => {
        target.set(Array.from({ length: target.length }, (_, index) => index));
        return target;
      }
    });
    const id = createClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
