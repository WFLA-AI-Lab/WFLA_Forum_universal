import { upstreamError } from '../core/errors';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_UPSTREAM_BODY_BYTES = 64 * 1024;

export interface OutboundRequestOptions {
  /** Absolute https URL of the third-party endpoint. */
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: URLSearchParams;
  /** Milliseconds before the request is aborted. */
  timeoutMs?: number;
  /** Human-readable provider name used in error messages. */
  label: string;
}

export interface OutboundJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Raw body, truncated, for diagnostics only. Never logged with secrets. */
  raw: string;
}

export interface EndpointProbe {
  /** True when the host answered and did not report a server-side failure. */
  ok: boolean;
  status: number;
  latencyMs: number;
  error: string | null;
}

function assertSafeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw upstreamError('第三方登录地址无效');
  }
  if (parsed.protocol !== 'https:') throw upstreamError('第三方登录必须使用 HTTPS');
  return parsed;
}

/**
 * Performs one outbound call to an OAuth provider.
 *
 * Design notes:
 * - Errors are always normalised into friendly AppErrors so an upstream outage
 *   can never surface as an opaque HTTP 500 "服务器内部错误".
 * - Responses are read as text with a hard size cap before JSON parsing, so a
 *   proxy/firewall HTML interstitial cannot blow up the request handler.
 * - The request is aborted after a timeout instead of hanging the worker.
 */
export async function outboundJson<T>(options: OutboundRequestOptions): Promise<OutboundJsonResult<T>> {
  const url = assertSafeUrl(options.url).toString();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  };
  if (options.headers) init.headers = options.headers;
  if (options.body) init.body = options.body;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw upstreamError(`${options.label} 网络请求失败，请稍后重试`, { reason });
  }

  // Assigned inside the try; the catch always throws, so it is never read unset.
  let raw: string;
  try {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_UPSTREAM_BODY_BYTES) {
      throw upstreamError(`${options.label} 返回的数据过大`);
    }
    raw = new TextDecoder().decode(buffer);
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') throw error;
    throw upstreamError(`${options.label} 响应读取失败`, {
      reason: error instanceof Error ? error.message : 'unknown error'
    });
  }

  let data: T | null = null;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as T;
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data, raw: raw.slice(0, 300) };
}

/**
 * Reachability probe used by the owner-only diagnostics console. Reports
 * latency and the concrete TLS/network error instead of throwing, so the
 * operator can tell a network problem apart from a configuration problem.
 */
/**
 * Reachability probe. An HTTP error such as 404 still proves DNS, TLS and the
 * outbound path work, which is what this check is for; only a missing response
 * or a 5xx is treated as a failure.
 */
export async function probeEndpoint(
  url: string,
  options: { method?: 'GET' | 'POST'; timeoutMs?: number } = {}
): Promise<EndpointProbe> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 6000;
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'WFLA-Wall-Healthcheck' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    return {
      ok: response.status < 500,
      status: response.status,
      latencyMs: Date.now() - started,
      error: null
    };
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: cause };
  }
}

/**
 * Reads a JSON array body defensively. GitHub's /user/emails endpoint returns a
 * JSON object with a message field on permission errors, which previously
 * crashed the handler when it was treated as an array.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
