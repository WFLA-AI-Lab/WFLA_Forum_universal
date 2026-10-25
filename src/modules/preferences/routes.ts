/**
 * Per-account preference routes (`/api/v1/me/preferences`).
 *
 * Only the signed-in user's own preferences are reachable; there is no
 * cross-user read or write, which keeps the privacy model simple. Writes are
 * audit-less on purpose: a skin choice is not a moderation action, and logging
 * every click would drown the audit trail.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { badRequest } from '../../core/errors';
import { requireUser } from '../identity/session';
import { readUserPreferences, saveUserSkinPreference, resolvePreferredSkin } from './service';

const skinPreferenceSchema = z.object({
  skin_id: z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9_-]*$/)
}).strict();

export const preferenceRoutes = new Hono<{ Bindings: Env }>();

/** GET /api/v1/me/preferences — the caller's own saved preferences. */
preferenceRoutes.get('/me/preferences', async c => {
  const actor = await requireUser(c);
  return c.json({ preferences: await readUserPreferences(c.env, actor.id) });
});

/**
 * PUT /api/v1/me/preferences/skin — remember a skin choice.
 *
 * Idempotent by design so the frontend can fire it on every switch without
 * worrying about duplicates. Rejects ids the site does not offer so the stored
 * value can never point at an unrenderable layout.
 */
preferenceRoutes.put('/me/preferences/skin', async c => {
  const actor = await requireUser(c);
  const parsed = skinPreferenceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('皮肤标识格式无效');

  const saved = await saveUserSkinPreference(c.env, actor.id, parsed.data.skin_id);
  if (!saved) throw badRequest('该皮肤不存在或未在本站启用');

  return c.json({ preference: { skin_id: saved.skin_id } });
});

/**
 * Resolves the effective skin for the caller: their saved preference, else the
 * site default. Exposed as a convenience so a client can render correctly on the
 * very first paint without two round-trips (config + preferences).
 */
preferenceRoutes.get('/me/preferences/effective-skin', async c => {
  const actor = await requireUser(c);
  const prefs = await readUserPreferences(c.env, actor.id);
  const fallback = String(c.req.query('default') ?? '').trim();
  return c.json({ skin_id: resolvePreferredSkin(prefs, fallback || 'x') });
});