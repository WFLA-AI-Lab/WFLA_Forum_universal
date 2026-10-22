// Pages Function: reverse-proxy /api/v1/* to the Cloudflare Worker.
// WFLA_API_ORIGIN must be set as a Pages environment variable (Production +
// Preview). The placeholder fallback keeps the module importable in local
// unit tests but returns an unreachable origin if the variable is missing.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const origin = context.env?.WFLA_API_ORIGIN ?? 'https://wfla-wall-api-placeholder.workers.dev';
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(context.request.headers);
  headers.set('Host', target.host);
  return fetch(target.toString(), {
    method: context.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'manual'
  });
}