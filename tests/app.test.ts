import { describe, expect, it } from 'vitest';
import app from '../src/index';

describe('health', () => {
  it('returns ok', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe('ok');
  });
});
