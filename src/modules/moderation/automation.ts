import type { Env } from '../../env';
import { createId, nowIso } from '../../core/utils';
import { insertAudit } from './audit';

export type ModerationRuleKind =
  | 'report_threshold'
  | 'sensitive_words'
  | 'high_link_density'
  | 'duplicate_content'
  | 'new_user_flood';

export interface ModerationRule {
  id: string;
  kind: ModerationRuleKind;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  config: Record<string, unknown>;
  updated_at: string;
}

interface RuleRow {
  id: string;
  kind: ModerationRuleKind;
  name: string;
  description: string;
  enabled: number;
  threshold: number;
  config: string;
  updated_at: string;
}

export interface AutomationResult {
  matched: boolean;
  ruleId: string | null;
  action: 'hidden' | 'none';
  reason: string;
}

function parseRule(row: RuleRow): ModerationRule {
  let config: Record<string, unknown>;
  try { config = JSON.parse(row.config) as Record<string, unknown>; } catch { config = {}; }
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    threshold: row.threshold,
    config,
    updated_at: row.updated_at
  };
}

async function readRule(env: Env, kind: ModerationRuleKind): Promise<ModerationRule | null> {
  const row = await env.DB.prepare(
    'SELECT id, kind, name, description, enabled, threshold, config, updated_at FROM moderation_rules WHERE kind = ? LIMIT 1'
  ).bind(kind).first<RuleRow>();
  return row ? parseRule(row) : null;
}

async function notifyModerators(env: Env, title: string, body: string, link: string): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('moderator','admin','owner') AND status = 'active'`
  ).all<{ id: string }>();
  const timestamp = nowIso();
  for (const moderator of rows.results ?? []) {
    await env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), moderator.id, 'moderation_risk', title, body.slice(0, 180), link, timestamp).run();
  }
}

async function hideThread(env: Env, threadId: string, reason: string, actorId: string | null, ruleId: string | null): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT id FROM threads WHERE id = ? AND status NOT IN ('deleted','hidden')`)
    .bind(threadId).first<{ id: string }>();
  if (!row) return false;
  await env.DB.prepare(`UPDATE threads SET status = 'hidden', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), threadId).run();
  await insertAudit(env, actorId, 'thread.status_change', 'thread', threadId, reason, {
    status: 'hidden', automated: actorId === null, rule_id: ruleId
  });
  return true;
}

async function hidePost(env: Env, postId: string, reason: string, actorId: string | null, ruleId: string | null): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT id, thread_id FROM posts WHERE id = ? AND status NOT IN ('deleted','hidden')`)
    .bind(postId).first<{ id: string; thread_id: string }>();
  if (!row) return false;
  await env.DB.prepare(`UPDATE posts SET status = 'hidden', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), postId).run();
  await insertAudit(env, actorId, 'post.status_change', 'post', postId, reason, {
    status: 'hidden', automated: actorId === null, rule_id: ruleId
  });
  return true;
}

async function recordRiskEvent(
  env: Env,
  rule: ModerationRule | null,
  targetType: 'thread' | 'post' | 'user' | 'message',
  targetId: string,
  actorId: string | null,
  score: number,
  reason: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO risk_events (id, rule_id, target_type, target_id, actor_id, score, reason, metadata, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).bind(createId(), rule?.id ?? null, targetType, targetId, actorId, score, reason, JSON.stringify(metadata), nowIso()).run();
}

async function applyOutcome(
  env: Env,
  rule: ModerationRule | null,
  targetType: 'thread' | 'post',
  targetId: string,
  threadId: string,
  actorId: string | null,
  reason: string,
  metadata: Record<string, unknown>
): Promise<AutomationResult> {
  const hidden = targetType === 'thread'
    ? await hideThread(env, targetId, reason, null, rule?.id ?? null)
    : await hidePost(env, targetId, reason, null, rule?.id ?? null);
  await recordRiskEvent(env, rule, targetType, targetId, actorId, hidden ? 3 : 1, reason, metadata);
  if (hidden) {
    await notifyModerators(
      env,
      `自动监管：${rule?.name ?? '风险规则'}`,
      `${reason} · 对象 ${targetType}/${targetId}`,
      targetType === 'thread' ? `/threads/${targetId}` : `/threads/${threadId}`
    );
  }
  return { matched: true, ruleId: rule?.id ?? null, action: hidden ? 'hidden' : 'none', reason };
}

async function notifyChatRisk(env: Env, rule: ModerationRule | null, reason: string, messageId: string, conversationId: string): Promise<void> {
  await notifyModerators(
    env,
    `聊天自动监管：${rule?.name ?? '风险规则'}`,
    `${reason} · 对象 message/${messageId}`,
    `/admin/chat/groups/${conversationId}`
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function numberConfig(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Checks publication-time rules. The caller has already persisted the content;
 * this function only records risk and changes status when a rule matches.
 */
export async function applyPublicationRules(
  env: Env,
  input: {
    targetType: 'thread' | 'post';
    targetId: string;
    threadId: string;
    authorId: string;
    content: string;
  }
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const lower = input.content.toLowerCase();

  const sensitive = await readRule(env, 'sensitive_words');
  if (sensitive?.enabled) {
    const words = stringList(sensitive.config.words);
    const hit = words.find(word => word && lower.includes(word.toLowerCase()));
    if (hit) {
      results.push(await applyOutcome(env, sensitive, input.targetType, input.targetId, input.threadId, input.authorId, `命中高风险词「${hit}」`, { word: hit }));
    }
  }

  const links = (input.content.match(/https?:\/\/[^\s]+/gi) ?? []).length;
  const linkRule = await readRule(env, 'high_link_density');
  if (linkRule?.enabled && links >= linkRule.threshold) {
    results.push(await applyOutcome(env, linkRule, input.targetType, input.targetId, input.threadId, input.authorId, `单条内容包含 ${links} 个链接`, { links }));
  }

  const duplicate = await readRule(env, 'duplicate_content');
  if (duplicate?.enabled) {
    const minutes = numberConfig(duplicate.config.window_minutes, 10);
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM posts
        WHERE author_id = ? AND content_markdown = ? AND created_at >= ?`
    ).bind(input.authorId, input.content, since).first<{ total: number }>();
    if (Number(row?.total ?? 0) > duplicate.threshold) {
      results.push(await applyOutcome(env, duplicate, input.targetType, input.targetId, input.threadId, input.authorId, `${minutes} 分钟内重复发布相同内容`, { count: Number(row?.total ?? 0), window_minutes: minutes }));
    }
  }

  const flood = await readRule(env, 'new_user_flood');
  if (flood?.enabled) {
    const minutes = numberConfig(flood.config.window_minutes, 10);
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM posts WHERE author_id = ? AND created_at >= ?`)
      .bind(input.authorId, since).first<{ total: number }>();
    if (Number(row?.total ?? 0) > flood.threshold) {
      results.push(await applyOutcome(env, flood, input.targetType, input.targetId, input.threadId, input.authorId, `${minutes} 分钟内发布了 ${Number(row?.total ?? 0)} 条内容`, { count: Number(row?.total ?? 0), window_minutes: minutes }));
    }
  }

  return results;
}

/**
 * Applies the same publication risks to chat messages. Chat content is never
 * automatically hidden in v0.10.0; a matching message is recorded as a risk
 * event and moderators are notified for human review.
 */
export async function applyChatRules(
  env: Env,
  input: { messageId: string; conversationId: string; senderId: string; content: string }
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const lower = input.content.toLowerCase();

  const sensitive = await readRule(env, 'sensitive_words');
  if (sensitive?.enabled) {
    const words = stringList(sensitive.config.words);
    const hit = words.find(word => word && lower.includes(word.toLowerCase()));
    if (hit) {
      await recordRiskEvent(env, sensitive, 'message', input.messageId, input.senderId, 3, `聊天命中高风险词「${hit}」`, { word: hit, conversation_id: input.conversationId });
      await notifyChatRisk(env, sensitive, `聊天命中高风险词「${hit}」`, input.messageId, input.conversationId);
      results.push({ matched: true, ruleId: sensitive.id, action: 'none', reason: `命中高风险词「${hit}」` });
    }
  }

  const links = (input.content.match(/https?:\/\/[^\s]+/gi) ?? []).length;
  const linkRule = await readRule(env, 'high_link_density');
  if (linkRule?.enabled && links >= linkRule.threshold) {
    await recordRiskEvent(env, linkRule, 'message', input.messageId, input.senderId, 2, `聊天单条内容包含 ${links} 个链接`, { links, conversation_id: input.conversationId });
    await notifyChatRisk(env, linkRule, `聊天单条内容包含 ${links} 个链接`, input.messageId, input.conversationId);
    results.push({ matched: true, ruleId: linkRule.id, action: 'none', reason: `单条内容包含 ${links} 个链接` });
  }

  const duplicate = await readRule(env, 'duplicate_content');
  if (duplicate?.enabled) {
    const minutes = numberConfig(duplicate.config.window_minutes, 10);
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM chat_messages
        WHERE sender_id = ? AND content_markdown = ? AND created_at >= ?`
    ).bind(input.senderId, input.content, since).first<{ total: number }>();
    if (Number(row?.total ?? 0) > duplicate.threshold) {
      await recordRiskEvent(env, duplicate, 'message', input.messageId, input.senderId, 2, `聊天 ${minutes} 分钟内重复发送相同内容`, { count: Number(row?.total ?? 0), window_minutes: minutes, conversation_id: input.conversationId });
      results.push({ matched: true, ruleId: duplicate.id, action: 'none', reason: `${minutes} 分钟内重复发布相同内容` });
    }
  }

  const flood = await readRule(env, 'new_user_flood');
  if (flood?.enabled) {
    const minutes = numberConfig(flood.config.window_minutes, 10);
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM chat_messages WHERE sender_id = ? AND created_at >= ?`
    ).bind(input.senderId, since).first<{ total: number }>();
    if (Number(row?.total ?? 0) > flood.threshold) {
      await recordRiskEvent(env, flood, 'message', input.messageId, input.senderId, 2, `聊天 ${minutes} 分钟内发送 ${Number(row?.total ?? 0)} 条消息`, { count: Number(row?.total ?? 0), window_minutes: minutes, conversation_id: input.conversationId });
      results.push({ matched: true, ruleId: flood.id, action: 'none', reason: `${minutes} 分钟内发布了 ${Number(row?.total ?? 0)} 条内容` });
    }
  }

  return results;
}

/**
 * Hides a target once distinct reporters reach the configured threshold.
 * Rejected reports do not count toward the risk score.
 */
export async function applyReportThreshold(
  env: Env,
  input: { targetType: 'thread' | 'post'; targetId: string; threadId?: string }
): Promise<AutomationResult | null> {
  const rule = await readRule(env, 'report_threshold');
  if (!rule?.enabled) return null;
  const count = await env.DB.prepare(
    `SELECT COUNT(DISTINCT reporter_id) AS total FROM reports
      WHERE target_type = ? AND target_id = ? AND status != 'rejected'`
  ).bind(input.targetType, input.targetId).first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  if (total < rule.threshold) return null;
  const threadId = input.threadId ?? input.targetId;
  return applyOutcome(env, rule, input.targetType, input.targetId, threadId, null, `${total} 个不同用户举报`, { reports: total });
}
