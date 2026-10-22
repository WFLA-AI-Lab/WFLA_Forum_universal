export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = new URL(url.pathname + url.search, 'https://wfla-wall.wfla-wall.workers.dev');
  const headers = new Headers(context.request.headers);
  headers.set('Host', target.host);
  return fetch(target.toString(), {
    method: context.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'manual'
  });
}