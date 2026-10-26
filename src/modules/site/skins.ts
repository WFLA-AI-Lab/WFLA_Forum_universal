/**
 * The server-side half of the skin system.
 *
 * A "skin" is a complete frontend layout, not a colour variant: each skin may
 * rearrange the page however it likes. The backend only needs to know which
 * skins exist so that:
 *   - the admin console can offer a default/allow-list without a redeploy;
 *   - any client (including a future iOS/Android shell) can discover them.
 *
 * The renderable components live in frontend/src/skins/<id>/ and are registered
 * in frontend/src/skins/registry.ts. Both sides must stay in sync on the *ids*
 * and on SKIN_CONTRACT_VERSION.
 */

export interface SkinDescriptor {
  id: string;
  name: string;
  description: string;
  /** 'stable' skins may be the site default; 'preview' ones are opt-in. */
  status: 'stable' | 'preview';
}

export const SKIN_REGISTRY: readonly SkinDescriptor[] = [
  {
    id: 'x',
    name: 'WFLA X',
    description: '为 WFLA 校园社区设计的响应式实时信息流界面。',
    status: 'stable'
  }
];

export const STABLE_SKIN_IDS: readonly string[] = SKIN_REGISTRY
  .filter(skin => skin.status === 'stable')
  .map(skin => skin.id);

export const DEFAULT_SKIN_ID = 'x';

export function findSkin(id: string | undefined | null): SkinDescriptor | undefined {
  if (!id) return undefined;
  return SKIN_REGISTRY.find(skin => skin.id === id);
}

export function isKnownSkin(id: string | undefined | null): boolean {
  return Boolean(findSkin(id));
}

/**
 * Parses the comma/space separated allow-list stored in app_settings.
 * Unknown ids are dropped; an empty or unusable value falls back to every skin.
 */
export function resolveAllowedSkins(raw: string | undefined | null): SkinDescriptor[] {
  const ids = String(raw ?? '')
    .split(/[,\s]+/)
    .map(value => value.trim())
    .filter(Boolean);
  if (ids.length === 0) return [...SKIN_REGISTRY];
  const unique = [...new Set(ids)];
  const resolved = unique
    .map(id => findSkin(id))
    .filter((skin): skin is SkinDescriptor => Boolean(skin));
  return resolved.length > 0 ? resolved : [...SKIN_REGISTRY];
}

/** Picks a usable default: the configured one if allowed, otherwise the first allowed. */
export function resolveDefaultSkin(requested: string | undefined | null, allowed: SkinDescriptor[]): SkinDescriptor {
  const allowedIds = allowed.map(skin => skin.id);
  const wanted = findSkin(requested);
  if (wanted && allowedIds.includes(wanted.id)) return wanted;
  const fallback = allowed.find(skin => skin.id === DEFAULT_SKIN_ID) ?? allowed[0];
  return fallback ?? SKIN_REGISTRY[0]!;
}
