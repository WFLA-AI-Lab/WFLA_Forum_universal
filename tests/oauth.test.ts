import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env, Role } from '../src/env';
import { sha256 } from '../src/modules/identity/session';
import { addSeconds, nowIso } from '../src/core/utils';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

const OWNER_ID = 'owner-oauth';
const OWNER_TOKEN = 'owner-token';

async function migrate() {
  const files = [
    '0001_init.sql',
    '0002_invitations_external_auth.sql',
    '0003_microsoft_oauth.sql',
    '0004_engagement.sql',
    '0005_oauth_providers.sql',
    '0006_app_settings.sql'
  ];
  for (const file of files) {
    const sql = readFileSync(`src/migrations/${file}`, 'utf8');
    for (const statement of sql
      .split(';')
      .map(value => value.replace(/^\s*--.*$/gm, '').trim())
      .filter(value => value && !/^PRAGMA\b/i.test(value))) {
      await env.DB.prepare(statement).run();
    }
  }
}

async function seedOwner(): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, graduation_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(OWNER_ID, 'owner', bcrypt.hashSync('OwnerPass1!', 4), '赵俊钦', '2029', 'owner' satisfies Role, 'active', now, now).run();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256(OWNER_TOKEN), OWNER_ID, addSeconds(new Date(), 3600).toISOString(), now).run();
}

async function createLinkState(): Promise<string> {
  const state = 'state-' + Math.random().toString(36).slice(2);
  await env.DB.prepare(
    'INSERT INTO oauth_states (state, provider, mode, user_id, created_at, expires_at, return_to) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(state, 'github', 'link', OWNER_ID, nowIso(), addSeconds(new Date(), 600).toISOString(), '/').run();
  return state;
}

function callbackRequest(state: string): Request {
  return new Request(`http://forum.test/api/v1/auth/github/callback?code=abc&state=${state}`, {
    headers: {
      'Cookie': `wfla_oauth_state=${state}; wfla_session=${OWNER_TOKEN}`,
      'Host': 'forum.test'
    }
  });
}

// Minimal stand-in for the parts of Response the OAuth handler actually reads.
function rawResponse(status: number, body: string): Response {
  const bytes = new TextEncoder().encode(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer
  } as unknown as Response;
}

function jsonResponse(status: number, body: unknown): Response {
  return rawResponse(status, JSON.stringify(body));
}

interface GitHubMockPlan {
  token: unknown;
  profile?: unknown;
  emails?: unknown;
}

function installGitHubMock(plan: GitHubMockPlan) {
  const tokenBody = plan.token;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes('access_token')) {
      if (tokenBody instanceof Error) throw tokenBody;
      if (typeof tokenBody === 'string') return rawResponse(200, tokenBody);
      return jsonResponse(200, tokenBody);
    }
    if (url.includes('/user/emails')) {
      if (plan.emails instanceof Error) throw plan.emails;
      return jsonResponse(200, plan.emails ?? []);
    }
    return jsonResponse(200, plan.profile ?? { id: 42, login: 'RulerCordelius', email: null });
  });
}

beforeEach(async () => {
  const testEnv = await createTestEnv();
  env = testEnv.env;
  mf = testEnv.mf;
  await migrate();
  await seedOwner();
  // Provide complete GitHub OAuth config so the handler exercises the network
  // path rather than failing early on missing configuration.
  env.GITHUB_CLIENT_ID = 'test-client-id';
  env.GITHUB_CLIENT_SECRET = 'test-client-secret';
  env.GITHUB_REDIRECT_URI = 'http://forum.test/api/v1/auth/github/callback';
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mf.dispose();
});

describe('github oauth callback resilience', () => {
  it('redirects back to the site with a message instead of returning HTTP 500 when the network fails', async () => {
    installGitHubMock({ token: new TypeError('fetch failed') });
    const state = await createLinkState();

    const response = await app.request(callbackRequest(state), undefined, env);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('oauth_error=');
    expect(response.headers.get('Location')).not.toContain('INTERNAL_ERROR');
  });

  it('redirects with a message when the token endpoint returns a non-JSON body', async () => {
    installGitHubMock({ token: '<html>blocked by proxy</html>' });
    const state = await createLinkState();

    const response = await app.request(callbackRequest(state), undefined, env);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('oauth_error=');
  });

  it('links the account when /user/emails answers with an object instead of an array', async () => {
    installGitHubMock({
      token: { access_token: 'gho_test' },
      profile: { id: 4242, login: 'RulerCordelius', email: null },
      emails: { message: 'Resource not accessible by integration' }
    });
    const state = await createLinkState();

    const response = await app.request(callbackRequest(state), undefined, env);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('linked=github');
    const row = await env.DB.prepare('SELECT provider, subject FROM oauth_accounts WHERE user_id = ?')
      .bind(OWNER_ID).first<{ provider: string; subject: string }>();
    expect(row?.provider).toBe('github');
    expect(row?.subject).toBe('4242');
  });

  it('links the account even when the optional email lookup fails at the network layer', async () => {
    installGitHubMock({
      token: { access_token: 'gho_test' },
      profile: { id: 4243, login: 'RulerCordelius', email: null },
      emails: new TypeError('fetch failed')
    });
    const state = await createLinkState();

    const response = await app.request(callbackRequest(state), undefined, env);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('linked=github');
  });
});

describe('owner diagnostics', () => {
  it('rejects anonymous callers', async () => {
    const response = await app.request('/api/v1/admin/diagnostics', undefined, env);
    expect(response.status).toBe(401);
  });

  it('reports each provider endpoint for the owner', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0)
    }) as unknown as Response);

    const response = await app.request('/api/v1/admin/diagnostics', {
      headers: { Cookie: `wfla_session=${OWNER_TOKEN}` }
    }, env);

    expect(response.status).toBe(200);
    const body = await response.json() as { results: Record<string, { ok: boolean }>; hint: string | null };
    expect(Object.keys(body.results).sort()).toEqual(['github_api', 'github_oauth', 'microsoft_login']);
    expect(body.hint).toBeNull();
  });
});
