import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './env';
import { AppError } from './core/errors';
import { identityRoutes } from './modules/identity/routes';
import { contentRoutes } from './modules/content/routes';
import { moderationRoutes } from './modules/moderation/routes';
import { notificationRoutes } from './modules/notification/routes';
import { invitationRoutes } from './routes/invitation.routes';
import { microsoftAuthRoutes } from './routes/microsoft-auth.routes';
import { githubAuthRoutes } from './routes/github-auth.routes';
import { oauthProviderRoutes } from './routes/oauth-provider.routes';
import { settingsRoutes } from './modules/settings/routes';

const app = new Hono<{ Bindings: Env }>().basePath('/api/v1');

app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin, c) => {
    const fallback = c.env?.FRONTEND_ORIGIN ?? 'https://forum.example.com';
    const allowed = (c.env?.ENVIRONMENT === 'local')
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : [fallback];
    return allowed.includes(origin ?? '') ? origin : fallback;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 600
}));

app.get('/health', async c => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/', identityRoutes);
app.route('/', contentRoutes);
app.route('/', moderationRoutes);
app.route('/', notificationRoutes);
app.route('/', invitationRoutes);
app.route('/', microsoftAuthRoutes);
app.route('/', githubAuthRoutes);
app.route('/', oauthProviderRoutes);
app.route('/', settingsRoutes);

app.notFound(c => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404));
app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json({ error: { code: error.code, message: error.message, details: error.details ?? null } }, error.status as 400);
  }
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return c.json({ error: { code: 'RATE_LIMITED', message: error.message } }, error.status as 400);
  }
  console.error(JSON.stringify({ level: 'error', message: error.message, stack: error.stack, path: c.req.path }));
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500);
});

export default app;