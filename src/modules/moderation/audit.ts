import type { Env } from '../../env';
import { createId, nowIso } from '../../core/utils';

/**
 * Append-only audit trail for every sensitive or automated moderation action.
 * Routes should never format audit SQL by hand; using this helper keeps the
 * metadata JSON shape and timestamp behavior consistent.
 */
export async function insertAudit(
  env: Env,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(createId(), actorId, action, targetType, targetId, reason, JSON.stringify(metadata), nowIso()).run();
}
