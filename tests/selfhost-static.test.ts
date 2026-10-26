import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';
import { applyStaticHeaders, createSpaFallback, isStaticAssetPath } from '../src/selfhost/static';

let root = '';

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('self-host static fallback', () => {
  it('classifies fingerprinted assets as non-document paths', () => {
    expect(isStaticAssetPath('/assets/PlaceholderSkin-abc123.js')).toBe(true);
    expect(isStaticAssetPath('/assets/index-abc123.css')).toBe(true);
    expect(isStaticAssetPath('/thread/abc')).toBe(false);
  });

  it('returns ASSET_NOT_FOUND instead of index HTML for missing JS', async () => {
    root = await mkdtemp(join(tmpdir(), 'wfla-static-'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>WFLA Wall</title>');
    const app = new Hono();
    app.get('*', createSpaFallback(root));

    const asset = await app.request('/assets/PlaceholderSkin-missing.js');
    expect(asset.status).toBe(404);
    expect(asset.headers.get('content-type')).toContain('application/json');
    const body = await asset.json() as { error: { code: string } };
    expect(body.error.code).toBe('ASSET_NOT_FOUND');

    const page = await app.request('/some-page');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
  });

  it('sets immutable cache headers for assets and revalidation for HTML', async () => {
    root = await mkdtemp(join(tmpdir(), 'wfla-static-'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>WFLA Wall</title>');
    await writeFile(join(root, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" />');
    const app = new Hono();
    app.get('*', createSpaFallback(root));

    const page = await app.request('/page');
    expect(page.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');

    const headers = new Headers();
    const mock = { header: (name: string, value: string) => headers.set(name, value) };
    applyStaticHeaders(join(root, 'assets', 'index-abc.js'), mock as never);
    expect(headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
});
