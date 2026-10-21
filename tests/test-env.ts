import { Miniflare } from 'miniflare';
import type { Env } from '../src/env';
import { createId } from '../src/core/utils';

export async function createTestEnv(): Promise<{ env: Env; mf: Miniflare }> {
  const mf = new Miniflare({
    workers: [{
      config: {
        name: `test-${createId()}`,
        compatibilityDate: '2026-10-01',
        manifest: {
          mainModule: 'index.js',
          modules: { 'index.js': { type: 'esm', contents: 'export default {}' } }
        },
        env: {
          DB: { type: 'd1', id: 'TEST_DB' },
          MEDIA: { type: 'r2', name: 'TEST_MEDIA' },
          AUTH_SESSION_SECRET: { type: 'text', value: 'test-secret' },
          ENVIRONMENT: { type: 'text', value: 'local' },
          FORUM_NAME: { type: 'text', value: 'Test' },
          SESSION_TTL_SECONDS: { type: 'text', value: '3600' }
        }
      }
    }]
  });
  const db = await mf.getD1Database('DB') as D1Database;
  const media = await mf.getR2Bucket('MEDIA') as unknown as R2Bucket;
  const env = {
    DB: db,
    MEDIA: media,
    AUTH_SESSION_SECRET: 'test-secret',
    ENVIRONMENT: 'local',
    FORUM_NAME: 'Test',
    SESSION_TTL_SECONDS: '3600'
  } satisfies Env;
  return { env, mf };
}
