import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { createServer } from 'node:http';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import apiApp from '../index';
import { loadConfig, toEnv } from './config';
import { SqliteD1 } from './sqlite-d1';
import { applyStoredSettings } from '../modules/settings/service';
import { expireSanctions } from '../modules/moderation/appeal.routes';
import { applyStaticHeaders, createSpaFallback } from './static';

const config = loadConfig();
const db = new SqliteD1(config.dbPath);
const env = toEnv(config, db as unknown as D1Database);
const frontendRoot = resolve(config.frontendDir);

// Runtime settings live in SQLite and override .env without a restart.
await applyStoredSettings(env);

if (!existsSync(frontendRoot)) {
  console.warn(`[wfla] 前端目录不存在：${frontendRoot}，仅提供 API。`);
}

const selfHost = new Hono<{ Bindings: typeof env }>();

selfHost.use('*', async (c, next) => {
  c.env = env;
  await next();
});

selfHost.route('/', apiApp);

if (existsSync(frontendRoot)) {
  selfHost.use('*', serveStatic({ root: frontendRoot, onFound: applyStaticHeaders }));

  selfHost.get('*', createSpaFallback(frontendRoot));
}

const rootApp = selfHost;
const requestListener = getRequestListener((request, ...rest) => rootApp.fetch(request, ...rest));
const server = createServer(requestListener);

const sanctionTimer = setInterval(() => {
  void expireSanctions(env).catch(error => {
    console.warn('[wfla] sanction expiry failed:', error instanceof Error ? error.message : String(error));
  });
}, 60_000);
sanctionTimer.unref();

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`[wfla] listening on ${env.FRONTEND_ORIGIN ?? config.publicOrigin} (local ${config.host}:${port})`);
  console.log(`[wfla] database: ${config.dbPath}`);
  console.log(`[wfla] frontend: ${config.frontendDir}`);
  console.log(`[wfla] cookie: Secure=${env.COOKIE_SECURE ?? config.cookieSecure}, SameSite=${env.COOKIE_SAMESITE ?? config.cookieSameSite}`);
});

function shutdown(signal: string): void {
  console.log(`[wfla] ${signal} received, shutting down`);
  server.close(() => {
    clearInterval(sanctionTimer);
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
