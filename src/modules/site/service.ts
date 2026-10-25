import type { Env } from '../../env';
import { nowIso } from '../../core/utils';
import {
  SKIN_REGISTRY,
  resolveAllowedSkins,
  resolveDefaultSkin,
  type SkinDescriptor
} from './skins';

/**
 * Public, non-secret site configuration. Stored in app_settings so it can be
 * changed from the admin console without a redeploy.
 */
export const SITE_SETTING_DEFAULTS = {
  default_skin: 'x',
  allowed_skins: 'x,endfield',
  guest_read_enabled: 'true',
  registration_enabled: 'true',
  site_tagline: '世外中学校园论坛'
} as const;

export type SiteSettingKey = keyof typeof SITE_SETTING_DEFAULTS;
export const SITE_SETTING_KEYS = Object.keys(SITE_SETTING_DEFAULTS) as SiteSettingKey[];

export function isSiteSettingKey(key: string): key is SiteSettingKey {
  return (SITE_SETTING_KEYS as string[]).includes(key);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

/**
 * Reads one raw stored site setting, falling back to the compiled-in default.
 * Used by modules that need a single policy value (for example the allow-list
 * check when saving a per-account preference) without loading the whole config.
 */
export async function rawSiteSetting(env: Env, key: SiteSettingKey): Promise<string> {
  const map = await readSiteRows(env);
  return rawValue(map, key);
}
export interface PublicSiteConfig {
  forum_name: string;
  tagline: string;
  version: string;
  api_version: string;
  skin_contract_version: number;
  default_skin: string;
  skins: SkinDescriptor[];
  guest_read_enabled: boolean;
  registration_enabled: boolean;
}

export interface AdminSiteConfig extends PublicSiteConfig {
  all_skins: SkinDescriptor[];
  updated_at: string | null;
}

/** Version numbers of the running build, injected by the caller. */
export interface SiteVersionInfo {
  app: string;
  api: string;
  skinContract: number;
}

interface SettingRow {
  key: string;
  value: string;
}

async function readSiteRows(env: Env): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await env.DB.prepare(
      `SELECT key, value FROM app_settings WHERE key IN (${SITE_SETTING_KEYS.map(() => '?').join(', ')})`
    ).bind(...SITE_SETTING_KEYS).all<SettingRow>();
    for (const row of rows.results ?? []) map.set(row.key, row.value);
  } catch (error) {
    // Migration 0007 not applied yet: fall back to the compiled-in defaults.
    console.warn('[wfla] app_settings unavailable for site config; using defaults');
    if (error instanceof Error) console.warn(`[wfla] ${error.message}`);
  }
  return map;
}

function rawValue(map: Map<string, string>, key: SiteSettingKey): string {
  return map.get(key) ?? SITE_SETTING_DEFAULTS[key];
}

async function readUpdatedAt(env: Env): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT MAX(updated_at) AS updated_at FROM app_settings WHERE key IN (${SITE_SETTING_KEYS.map(() => '?').join(', ')})`
    ).bind(...SITE_SETTING_KEYS).first<{ updated_at: string | null }>();
    if (!row?.updated_at || row.updated_at === '1970-01-01T00:00:00.000Z') return null;
    return row.updated_at;
  } catch {
    return null;
  }
}

export async function readAdminSiteConfig(
  env: Env,
  version: SiteVersionInfo
): Promise<AdminSiteConfig> {
  const map = await readSiteRows(env);
  const allowed = resolveAllowedSkins(rawValue(map, 'allowed_skins'));
  const fallback = resolveDefaultSkin(rawValue(map, 'default_skin'), allowed);
  const tagline = rawValue(map, 'site_tagline').trim();
  return {
    forum_name: env.FORUM_NAME ?? '世外墙 WFLA Wall',
    tagline: tagline || SITE_SETTING_DEFAULTS.site_tagline,
    version: version.app,
    api_version: version.api,
    skin_contract_version: version.skinContract,
    default_skin: fallback.id,
    skins: allowed,
    all_skins: [...SKIN_REGISTRY],
    guest_read_enabled: parseBoolean(map.get('guest_read_enabled'), true),
    registration_enabled: parseBoolean(map.get('registration_enabled'), true),
    updated_at: await readUpdatedAt(env)
  };
}

export async function readPublicSiteConfig(
  env: Env,
  version: SiteVersionInfo
): Promise<PublicSiteConfig> {
  const admin = await readAdminSiteConfig(env, version);
  return {
    forum_name: admin.forum_name,
    tagline: admin.tagline,
    version: admin.version,
    api_version: admin.api_version,
    skin_contract_version: admin.skin_contract_version,
    default_skin: admin.default_skin,
    skins: admin.skins,
    guest_read_enabled: admin.guest_read_enabled,
    registration_enabled: admin.registration_enabled
  };
}

export interface SiteConfigUpdate {
  default_skin?: string | undefined;
  allowed_skins?: string[] | undefined;
  guest_read_enabled?: boolean | undefined;
  registration_enabled?: boolean | undefined;
  site_tagline?: string | undefined;
}

/**
 * Writes the site config and returns the freshly resolved values.
 *
 * The allow-list and the default skin are both validated against the compiled-in
 * skin registry, and the default is forced inside the allow-list, so a bad id can
 * never leave the site without a renderable skin.
 */
export async function persistSiteConfig(
  env: Env,
  update: SiteConfigUpdate,
  actorId: string,
  version: SiteVersionInfo
): Promise<{ changedFields: SiteSettingKey[]; config: AdminSiteConfig }> {
  const current = await readSiteRows(env);
  const currentAllowed = resolveAllowedSkins(rawValue(current, 'allowed_skins'));

  const nextAllowed = update.allowed_skins && update.allowed_skins.length > 0
    ? resolveAllowedSkins(update.allowed_skins.join(','))
    : currentAllowed;
  const nextDefault = resolveDefaultSkin(
    update.default_skin ?? rawValue(current, 'default_skin'),
    nextAllowed
  );

  const pairs: [SiteSettingKey, string][] = [];
  if (update.allowed_skins && update.allowed_skins.length > 0) {
    pairs.push(['allowed_skins', nextAllowed.map(skin => skin.id).join(',')]);
  }
  if (update.default_skin) pairs.push(['default_skin', nextDefault.id]);
  if (update.guest_read_enabled !== undefined) pairs.push(['guest_read_enabled', String(update.guest_read_enabled)]);
  if (update.registration_enabled !== undefined) pairs.push(['registration_enabled', String(update.registration_enabled)]);
  if (update.site_tagline !== undefined) pairs.push(['site_tagline', update.site_tagline.trim()]);

  if (pairs.length > 0) {
    const timestamp = nowIso();
    await env.DB.batch(pairs.map(([key, value]) => env.DB.prepare(
      `INSERT INTO app_settings (key, value, is_secret, updated_by, updated_at)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = 0,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).bind(key, value, actorId, timestamp)));
  }

  return {
    changedFields: pairs.map(([key]) => key),
    config: await readAdminSiteConfig(env, version)
  };
}
