import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Context } from 'hono';

/**
 * Paths that must never fall back to the SPA index. Fingerprinted or typed
 * assets should fail loudly when they are missing so deployment mistakes are
 * visible instead of becoming browser MIME errors and blank screens.
 */
export const STATIC_ASSET_PATTERN = /^\/(?:assets|static)\/|\.(?:js|mjs|css|map|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i;

export function isStaticAssetPath(path: string): boolean {
  return STATIC_ASSET_PATTERN.test(path);
}

/**
 * Static assets are immutable build artifacts. Long-lived caching is safe for
 * fingerprinted Vite files and useful for other public files, while HTML is
 * revalidated so deployments are picked up by the next navigation.
 */
export function applyStaticHeaders(path: string, c: Pick<Context, 'header'>): void {
  const normalized = path.replaceAll('\\', '/');
  const cacheControl = normalized.includes('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate';
  c.header('Cache-Control', cacheControl);
  c.header('X-Content-Type-Options', 'nosniff');
}

/**
 * Creates the document-only SPA fallback used after Hono's static middleware.
 * API and asset requests are intentionally excluded so a missing lazy skin
 * chunk is a clear 404, never a JavaScript file whose body is HTML.
 */
export function createSpaFallback(frontendRoot: string) {
  return async (c: Context): Promise<Response> => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
    }
    if (isStaticAssetPath(c.req.path)) {
      return c.json({ error: { code: 'ASSET_NOT_FOUND', message: '静态资源不存在，请重新部署前端' } }, 404);
    }
    const indexFile = join(frontendRoot, 'index.html');
    if (!existsSync(indexFile)) return c.text('frontend/index.html not found', 404);
    applyStaticHeaders(indexFile, c);
    return c.html(readFileSync(indexFile, 'utf8'));
  };
}
