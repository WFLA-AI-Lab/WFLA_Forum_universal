/**
 * Per-account preferences.
 *
 * Preferences are stored in a single generic row per user (`user_preferences`)
 * so adding a further field later is an ALTER TABLE, not a new module. The
 * public surface is deliberately narrow: read the whole record, write one field
 * at a time, each validated against the compiled-in registries.
 *
 * The first field is `skin_id`, so a signed-in member's chosen layout follows
 * them across devices instead of living only in browser localStorage. Guests
 * have no account, so they keep using localStorage only.
 */
import type { Env } from '../../env';
import { nowIso } from '../../core/utils';
import { isKnownSkin, DEFAULT_SKIN_ID, resolveAllowedSkins } from '../site/skins';
import { rawSiteSetting } from '../site/service';

export interface UserPreferences {
  skin_id: string | null;
  updated_at: string | null;
}

const EMPTY: UserPreferences = { skin_id: null, updated_at: null };

interface PreferenceRow {
  skin_id: string | null;
  updated_at: string;
}

/**
 * Reads a user's preferences. A missing row, a missing table (migration not yet
 * applied) or any storage error degrades to "no saved preference" rather than
 * breaking login: preferences are a convenience, not a correctness requirement.
 */
export async function readUserPreferences(env: Env, userId: string): Promise<UserPreferences> {
  try {
    const row = await env.DB.prepare(
      'SELECT skin_id, updated_at FROM user_preferences WHERE user_id = ?'
    ).bind(userId).first<PreferenceRow>();
    if (!row) return { ...EMPTY };
    return { skin_id: row.skin_id ?? null, updated_at: row.updated_at ?? null };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Records a skin choice for a user.
 *
 * Returns `undefined` for an unknown id or one the site allow-list forbids, so
 * the caller can answer 400 instead of storing a layout the frontend cannot
 * render. Keeping the per-account choice inside the site allow-list stops the
 * two from disagreeing after an admin narrows the list.
 */
export async function saveUserSkinPreference(
  env: Env,
  userId: string,
  requestedSkin: string
): Promise<{ skin_id: string } | undefined> {
  const id = requestedSkin.trim();
  if (!isKnownSkin(id)) return undefined;

  const allowed = resolveAllowedSkins(await rawSiteSetting(env, 'allowed_skins'));
  if (!allowed.some(skin => skin.id === id)) return undefined;

  await env.DB.prepare(
    `INSERT INTO user_preferences (user_id, skin_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET skin_id = excluded.skin_id, updated_at = excluded.updated_at`
  ).bind(userId, id, nowIso()).run();

  return { skin_id: id };
}

/** Resolves the skin a returning member should get: saved choice, else default. */
export function resolvePreferredSkin(prefs: UserPreferences, fallbackDefault: string): string {
  if (prefs.skin_id && isKnownSkin(prefs.skin_id)) return prefs.skin_id;
  return isKnownSkin(fallbackDefault) ? fallbackDefault : DEFAULT_SKIN_ID;
}