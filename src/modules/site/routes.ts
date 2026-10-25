import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { badRequest, forbidden } from '../../core/errors';
import { requireUser } from '../identity/session';
import { isOwner } from '../access/service';
import { insertAudit } from '../moderation/audit';
import { APP_VERSION, API_VERSION, SKIN_CONTRACT_VERSION } from '../../version';
import { SKIN_REGISTRY } from './skins';
import {
  readAdminSiteConfig,
  readPublicSiteConfig,
  persistSiteConfig
} from './service';

const VERSION = { app: APP_VERSION, api: API_VERSION, skinContract: SKIN_CONTRACT_VERSION } as const;

const skinId = z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9_-]*$/);

const siteConfigSchema = z.object({
  default_skin: skinId.optional(),
  allowed_skins: z.array(skinId).min(1).max(20).optional(),
  guest_read_enabled: z.boolean().optional(),
  registration_enabled: z.boolean().optional(),
  site_tagline: z.string().trim().max(120).optional()
}).strict();

export const siteRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/v1/site/config
 * Public, cacheable metadata every client reads on boot: branding, version
 * numbers and the list of skins this deployment offers.
 */
siteRoutes.get('/site/config', async c => {
  const config = await readPublicSiteConfig(c.env, VERSION);
  c.header('Cache-Control', 'public, max-age=30');
  return c.json({
    ...config,
    skin_registry: SKIN_REGISTRY
  });
});

siteRoutes.get('/admin/site-config', async c => {
  const actor = await requireUser(c);
  if (!isOwner(actor)) throw forbidden('只有论坛所有者可以修改站点外观设置');
  return c.json({
    config: await readAdminSiteConfig(c.env, VERSION),
    all_skins: SKIN_REGISTRY
  });
});

siteRoutes.patch('/admin/site-config', async c => {
  const actor = await requireUser(c);
  if (!isOwner(actor)) throw forbidden('只有论坛所有者可以修改站点外观设置');
  const parsed = siteConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? '站点设置格式无效');
  }
  const update = parsed.data;
  if (Object.values(update).every(value => value === undefined)) {
    throw badRequest('没有检测到需要保存的修改');
  }
  const { changedFields, config } = await persistSiteConfig(c.env, update, actor.id, VERSION);
  await insertAudit(
    c.env,
    actor.id,
    'site.config_update',
    'app_settings',
    'site',
    '通过管理后台修改站点外观与可见性设置',
    { changed_fields: changedFields }
  );
  return c.json({ config, changed_fields: changedFields, applied: 'immediate' });
});
