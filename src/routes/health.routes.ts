import { Hono } from 'hono';
import { APP_VERSION, API_VERSION, SCHEMA_VERSION } from '../version';

export const healthRoutes = new Hono();

/**
 * Liveness + build identity. Monitors and the admin console use the version
 * fields to confirm which build a machine is actually serving.
 */
healthRoutes.get('/health', c => c.json({
  status: 'ok',
  time: new Date().toISOString(),
  version: APP_VERSION,
  api_version: API_VERSION,
  schema_version: SCHEMA_VERSION
}));