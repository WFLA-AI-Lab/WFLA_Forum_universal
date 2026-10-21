import type { Role, UserStatus } from '../../env';
import { forbidden } from '../../core/errors';

export const ROLE_RANK: Record<Role, number> = {
  guest: 0,
  member: 1,
  moderator: 2,
  admin: 3,
  owner: 4
};

export function atLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export function requireRole(role: Role, required: Role): void {
  if (!atLeast(role, required)) throw forbidden(`需要 ${required} 或更高权限`);
}

export function canPost(status: UserStatus): boolean {
  return status === 'active';
}

export function canModerate(role: Role): boolean {
  return atLeast(role, 'moderator');
}

export function isAdmin(role: Role): boolean {
  return atLeast(role, 'admin');
}

export function isOwner(role: Role): boolean {
  return role === 'owner';
}
