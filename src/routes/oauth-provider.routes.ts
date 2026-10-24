import { Hono } from 'hono';
import type { Env } from '../env';

export const oauthProviderRoutes = new Hono<{ Bindings: Env }>();

oauthProviderRoutes.get('/auth/providers', c => c.json({
  microsoft: Boolean(c.env.MS_CLIENT_ID && c.env.MS_REDIRECT_URI),
  github: Boolean(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_REDIRECT_URI)
}));