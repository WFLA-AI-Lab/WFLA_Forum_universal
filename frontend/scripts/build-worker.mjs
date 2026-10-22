// Bundle the Pages Function into dist/_worker.js so `wrangler pages deploy`
// ships both the static assets and the /api/v1 proxy in one deploy.
// WFLA_API_ORIGIN comes from the Pages environment (Production + Preview).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(join(here, '../functions/api/v1/[[path]].js'), 'utf8');

// strip the "export async function onRequest" wrapper and re-emit as a
// module Worker with the same logic
const body = workerSrc
  .replace(/^\/\/.*$/gm, '')
  .replace(/export async function onRequest\(context\) \{/, 'const onRequest = async (context) => {')
  .trimEnd()
  .replace(/\}$/, '};');

const out = `${body}\n
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, params: {}, waitUntil: ctx.waitUntil.bind(ctx), next: () => env.ASSETS.fetch(request) });
    }
    return env.ASSETS.fetch(request);
  }
};
`;
writeFileSync(new URL('../dist/_worker.js', import.meta.url), out);
console.log('dist/_worker.js written');
