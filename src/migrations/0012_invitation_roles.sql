-- 0012: role-bearing invitation codes.
-- Existing invitations remain member invitations. The role is only a proposed
-- account role; registration still creates a pending account that an eligible
-- administrator must activate manually.
ALTER TABLE invitations ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'moderator', 'admin'));

CREATE INDEX IF NOT EXISTS idx_invitations_role_status
  ON invitations(role, used_by, revoked_at, expires_at);
