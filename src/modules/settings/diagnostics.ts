import { Hono } from 'hono';
import type { Env } from '../../env';
import { forbidden } from '../../core/errors';
import { probeEndpoint } from '../../core/http';
import { requireUser } from '../identity/session';
import { isOwner } from '../access/service';

const PROVIDER_ENDPOINTS: { key: string; label: string; url: string; method?: 'GET' | 'POST' }[] = [
  { key: 'github_api', label: 'GitHub API', url: 'https://api.github.com/' },
  // The token endpoint only accepts POST; a 404 already proves the host is reachable.
  { key: 'github_oauth', label: 'GitHub OAuth', url: 'https://github.com/login/oauth/access_token', method: 'POST' },
  { key: 'microsoft_login', label: 'Microsoft 登录', url: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration' }
];

interface ProbeResult {
  label: string;
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
}

function buildHint(results: Record<string, ProbeResult>): string | null {
  const failures = Object.values(results).filter(result => !result.ok);
  if (failures.length === 0) return null;
  if (failures.some(result => /certificate|self.signed|unable to verify|CERT_|UNABLE_TO_VERIFY/i.test(result.error ?? ''))) {
    return '服务器无法验证第三方 HTTPS 证书。通常由本机代理、内网穿透或自签名根证书引起；请在启动脚本中启用系统根证书信任（NODE_USE_SYSTEM_CA=1）。';
  }
  if (failures.some(result => /ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|fetch failed/i.test(result.error ?? ''))) {
    return '服务器无法解析或连接第三方域名。请检查 DNS 与出站网络后重试。';
  }
  return '至少一个第三方服务当前不可达，对应的第三方登录可能暂时失败。';
}

export const diagnosticsRoutes = new Hono<{ Bindings: Env }>();

diagnosticsRoutes.get('/admin/diagnostics', async c => {
  const actor = await requireUser(c);
  if (!isOwner(actor)) throw forbidden('只有论坛所有者可以运行网络诊断');

  const entries = await Promise.all(PROVIDER_ENDPOINTS.map(async endpoint => {
    const probe = endpoint.method
      ? await probeEndpoint(endpoint.url, { method: endpoint.method })
      : await probeEndpoint(endpoint.url);
    const result: ProbeResult = {
      label: endpoint.label,
      ok: probe.ok,
      status: probe.status,
      latency_ms: probe.latencyMs,
      error: probe.error
    };
    return [endpoint.key, result] as const;
  }));
  const results = Object.fromEntries(entries) as Record<string, ProbeResult>;
  return c.json({
    checked_at: new Date().toISOString(),
    results,
    hint: buildHint(results)
  });
});
