import { forbidden } from '../../core/errors';
import type { Role, UserStatus } from '../../env';

export const ROLE_RANK: Record<Role, number> = {
  guest: 0,
  member: 1,
  moderator: 2,
  admin: 3,
  owner: 4
};

/**
 * Role checks intentionally include account status. A pending account has no
 * authority even when an invitation proposed admin, and a muted/banned account
 * cannot exercise moderation rights until restored.
 */
export function canModerate(user: { role: Role; status: UserStatus }): boolean {
  return user.status === 'active' && ROLE_RANK[user.role] >= ROLE_RANK.moderator;
}

export function isAdmin(user: { role: Role; status: UserStatus }): boolean {
  return user.status === 'active' && ROLE_RANK[user.role] >= ROLE_RANK.admin;
}

export function isOwner(user: { role: Role; status: UserStatus }): boolean {
  return user.status === 'active' && user.role === 'owner';
}

export function requireRole(user: { role: Role; status: UserStatus }, required: Role): void {
  if (user.status !== 'active') throw forbidden('当前账号状态不可执行此操作');
  if (ROLE_RANK[user.role] < ROLE_RANK[required]) throw forbidden(`需要 ${required} 或更高权限的在职账号`);
}

export function canPost(status: UserStatus): boolean {
  return status === 'active';
}

/** Kept for local, non-session helpers that only have a role. */
export function atLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export function isAssignableRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[targetRole] < ROLE_RANK[actorRole];
}
