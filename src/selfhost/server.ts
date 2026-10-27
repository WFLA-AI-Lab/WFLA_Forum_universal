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
import { applyStaticHeaders, createSpaFallback, isStaticAssetPath } from './static';
import { createFileLogger } from './logger';

const config = loadConfig();
const logRetentionDays = Number(process.env.WFLA_LOG_RETENTION_DAYS ?? 14);
const logger = createFileLogger(config.logDir, Number.isFinite(logRetentionDays) && logRetentionDays > 0 ? logRetentionDays : 14);
const db = new SqliteD1(config.dbPath);
const env = toEnv(config, db as unknown as D1Database);
const frontendRoot = resolve(config.frontendDir);

// Runtime settings live in SQLite and override .env without a restart.
await applyStoredSettings(env);

if (!existsSync(frontendRoot)) {
  logger.warn(`[wfla] 前端目录不存在：${frontendRoot}，仅提供 API。`);
}

const selfHost = new Hono<{ Bindings: typeof env }>();

// Capture every API/document request and, especially, responses that Hono's
// error handler has already normalised to 500. Static files are excluded so
// asset-heavy pages do not drown out useful operational events.
selfHost.use('*', async (c, next) => {
  c.env = env;
  const started = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  try {
    await next();
    if (!isStaticAssetPath(path)) {
      const status = c.res.status;
      const fields = { method, path, status, duration_ms: Date.now() - started };
      if (status >= 500) logger.error('request completed', fields);
      else logger.info('request completed', fields);
    }
  } catch (error) {
    logger.error('request failed', {
      method,
      path,
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
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
    logger.error('sanction expiry failed', { error: error instanceof Error ? error.message : String(error) });
  });
}, 60_000);
sanctionTimer.unref();

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  logger.info('server started', {
    public_origin: env.FRONTEND_ORIGIN ?? config.publicOrigin,
    local_address: `${config.host}:${port}`,
    database: config.dbPath,
    frontend: config.frontendDir,
    log_file: logger.logPath,
    cookie_secure: env.COOKIE_SECURE ?? config.cookieSecure,
    cookie_same_site: env.COOKIE_SAMESITE ?? config.cookieSameSite
  });
  console.log(`[wfla] listening on ${env.FRONTEND_ORIGIN ?? config.publicOrigin} (local ${config.host}:${port})`);
  console.log(`[wfla] database: ${config.dbPath}`);
  console.log(`[wfla] frontend: ${config.frontendDir}`);
  console.log(`[wfla] logs: ${logger.logPath}`);
  console.log(`[wfla] cookie: Secure=${env.COOKIE_SECURE ?? config.cookieSecure}, SameSite=${env.COOKIE_SAMESITE ?? config.cookieSameSite}`);
});

function shutdown(signal: string): void {
  logger.info('server shutting down', { signal });
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
process.on('uncaughtException', error => {
  logger.error('uncaught exception', { error: error.message, stack: error.stack });
  console.error(error);
});
process.on('unhandledRejection', reason => {
  logger.error('unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
  console.error(reason);
});
