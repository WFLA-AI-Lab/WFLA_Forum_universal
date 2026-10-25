import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Announcement, InvitationItem, User } from '../skins/contract';
import { Badge, formatDate } from './shared';

type Notify = (tone: 'success' | 'error', message: string) => void;
type Mode = 'invitations' | 'announcements' | 'audit';
interface AuditItem { id: string; action: string; target_type: string; target_id: string; reason: string; created_at: string; actor_real_name?: string | null; actor_username?: string | null }
interface AdminAnnouncement extends Announcement { author_real_name: string; starts_at: string }
interface BoardItem { id: string; name: string; slug: string; description: string }

const ACTION_LABEL: Record<string, string> = {
  'user.create': '创建账号', 'user.activate': '激活账号', 'user.role_change': '变更角色', 'user.status_change': '变更状态',
  'user.password_reset': '重置密码', 'user.sessions_revoke': '撤销会话', 'user.note_create': '添加备注',
  'invitation.create': '生成邀请码', 'invitation.revoke': '吊销邀请码', 'report.resolve': '处理举报', 'report.reject': '驳回举报',
  'report.assign': '分配举报', 'thread.status_change': '变更话题状态', 'post.status_change': '变更回复状态',
  'announcement.create': '发布公告', 'announcement.delete': '删除公告', 'board.create': '创建板块',
  'settings.update': '更新高级设置', 'site.config_update': '更新站点配置'
};

export function OperationsPanel({ mode, notify }: { mode: Mode; me: User; notify: Notify }) {
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [ttl, setTtl] = useState(168);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [announcement, setAnnouncement] = useState({ title: '', content: '', level: 'normal', ends_at: '' });
  const [board, setBoard] = useState({ name: '', slug: '', description: '' });
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');

  async function run(task: () => Promise<unknown>, message: string) {
    try { await task(); notify('success', message); return true; }
    catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); return false; }
  }
  async function loadInvitations() { setInvitations((await api.get<{ items: InvitationItem[] }>('/invitations')).items); }
  async function loadAnnouncements() {
    const [a, b] = await Promise.all([
      api.get<{ items: AdminAnnouncement[] }>('/admin/announcements'),
      api.get<{ items: BoardItem[] }>('/boards')
    ]);
    setAnnouncements(a.items); setBoards(b.items);
  }
  async function loadAudit() {
    const params = new URLSearchParams({ limit: '200' });
    if (action) params.set('action', action);
    if (query.trim()) params.set('query', query.trim());
    setAudit((await api.get<{ items: AuditItem[] }>(`/admin/audit?${params}`)).items);
  }
  useEffect(() => {
    if (mode === 'invitations') void loadInvitations();
    else if (mode === 'announcements') void loadAnnouncements();
    else void loadAudit();
  }, [mode, action, query]);

  if (mode === 'invitations') {
    const unused = invitations.filter(item => !item.used_by && !item.revoked_at && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())).length;
    return (
      <>
        <section className="adm-invite-hero"><div><small>INVITE-ONLY ACCESS</small><h2>邀请码是进入 WFLA Wall 的唯一入口。</h2><p>使用后仍需管理员手动激活，所有发放与吊销行为都会进入审计日志。</p></div><div className="adm-invite-stats"><b>{unused}</b><span>当前可用</span></div></section>
        <section className="adm-toolbar"><label className="adm-inline-field">有效期<select value={ttl} onChange={e => setTtl(Number(e.target.value))}><option value={24}>1 天</option><option value={168}>7 天</option><option value={720}>30 天</option></select></label><button type="button" className="adm-primary push" onClick={() => void run(() => api.post('/invitations', { ttl_hours: ttl }), '邀请码已生成').then(async ok => { if (ok) await loadInvitations(); })}>＋ 生成邀请码</button></section>
        <section className="adm-card"><header><div><small>{invitations.length} CODES</small><h3>邀请码记录</h3></div></header><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>邀请码</th><th>状态</th><th>有效期</th><th>创建时间</th><th>使用者</th><th /></tr></thead><tbody>{invitations.length === 0 ? <tr><td colSpan={6}><div className="adm-empty"><span>○</span><p>还没有邀请码</p></div></td></tr> : invitations.map(item => { const expired = item.expires_at && new Date(item.expires_at).getTime() <= Date.now(); const status = item.used_by ? '已使用' : item.revoked_at ? '已吊销' : expired ? '已过期' : '可用'; return <tr key={item.id}><td><code className="adm-code">{item.code.slice(0, 8)}••••{item.code.slice(-6)}</code><button type="button" className="adm-copy" onClick={() => void navigator.clipboard?.writeText(item.code)}>复制</button></td><td><Badge tone={status === '可用' ? 'green' : status === '已使用' ? 'blue' : 'neutral'}>{status}</Badge></td><td>{formatDate(item.expires_at)}</td><td>{formatDate(item.created_at)}</td><td>{item.used_by ? item.used_by.slice(0, 10) : '—'}</td><td>{status === '可用' && <button type="button" className="adm-danger-ghost" onClick={() => void run(() => api.post(`/invitations/${item.id}/revoke`), '邀请码已吊销').then(async ok => { if (ok) await loadInvitations(); })}>吊销</button>}</td></tr>; })}</tbody></table></div></section>
      </>
    );
  }
  if (mode === 'announcements') {
    return (
      <section className="adm-two-column">
        <div>
          <article className="adm-card"><header><div><small>NEW BROADCAST</small><h3>发布全站公告</h3></div></header><div className="adm-form-grid"><label className="adm-field full"><span>标题</span><input value={announcement.title} onChange={e => setAnnouncement({ ...announcement, title: e.target.value })} /></label><label className="adm-field full"><span>正文</span><textarea rows={7} value={announcement.content} onChange={e => setAnnouncement({ ...announcement, content: e.target.value })} placeholder="支持 Markdown" /></label><label className="adm-field"><span>级别</span><select value={announcement.level} onChange={e => setAnnouncement({ ...announcement, level: e.target.value })}><option value="normal">普通</option><option value="important">重要</option><option value="urgent">紧急</option></select></label><label className="adm-field"><span>结束时间</span><input type="datetime-local" value={announcement.ends_at} onChange={e => setAnnouncement({ ...announcement, ends_at: e.target.value })} /></label><button type="button" className="adm-primary full" disabled={announcement.title.length < 2 || announcement.content.length < 1} onClick={() => void run(() => api.post('/announcements', { ...announcement, ends_at: announcement.ends_at ? new Date(announcement.ends_at).toISOString() : null }), '公告已发布并通知全员').then(async ok => { if (ok) { setAnnouncement({ title: '', content: '', level: 'normal', ends_at: '' }); await loadAnnouncements(); } })}>发布公告并通知全员</button></div></article>
          <article className="adm-card"><header><div><small>BOARDS</small><h3>板块结构</h3></div><span>{boards.length} 个</span></header><div className="adm-board-list">{boards.map(item => <div key={item.id}><span>#</span><div><b>{item.name}</b><small>/{item.slug} · {item.description || '暂无说明'}</small></div></div>)}</div><div className="adm-form-grid board-create"><label className="adm-field"><span>名称</span><input value={board.name} onChange={e => setBoard({ ...board, name: e.target.value })} /></label><label className="adm-field"><span>Slug</span><input value={board.slug} onChange={e => setBoard({ ...board, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></label><label className="adm-field full"><span>说明</span><input value={board.description} onChange={e => setBoard({ ...board, description: e.target.value })} /></label><button type="button" className="adm-secondary full" disabled={board.name.length < 2 || board.slug.length < 2} onClick={() => void run(() => api.post('/boards', board), '板块已创建').then(async ok => { if (ok) { setBoard({ name: '', slug: '', description: '' }); await loadAnnouncements(); } })}>创建板块</button></div></article>
        </div>
        <article className="adm-card"><header><div><small>PUBLISHED</small><h3>公告记录</h3></div></header><div className="adm-announcement-list">{announcements.length === 0 ? <div className="adm-empty"><span>○</span><p>还没有公告</p></div> : announcements.map(item => <div key={item.id}><header><Badge tone={item.level === 'urgent' ? 'red' : item.level === 'important' ? 'orange' : 'neutral'}>{item.level === 'urgent' ? '紧急' : item.level === 'important' ? '重要' : '普通'}</Badge><span>{formatDate(item.starts_at)}</span></header><h4>{item.title}</h4><p dangerouslySetInnerHTML={{ __html: item.content_html }} /><footer><span>{item.author_real_name}</span><button type="button" onClick={() => window.confirm('确定删除这条公告吗？') && void run(() => api.del(`/admin/announcements/${item.id}`), '公告已删除').then(async ok => { if (ok) await loadAnnouncements(); })}>删除</button></footer></div>)}</div></article>
      </section>
    );
  }
  return (
    <section className="adm-card">
      <header><div><small>IMMUTABLE TRAIL</small><h3>审计日志</h3></div><div className="adm-toolbar compact"><select value={action} onChange={e => setAction(e.target.value)}><option value="">全部动作</option>{Object.entries(ACTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="adm-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索操作者或对象" /></div></div></header>
      <div className="adm-table-wrap"><table className="adm-table audit"><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>原因</th><th>标识</th></tr></thead><tbody>{audit.length === 0 ? <tr><td colSpan={6}><div className="adm-empty"><span>○</span><p>没有符合条件的审计记录</p></div></td></tr> : audit.map(item => <tr key={item.id}><td>{formatDate(item.created_at)}</td><td><div className="adm-user-cell mini"><span className="adm-avatar tiny">{item.actor_real_name?.slice(-1) ?? '·'}</span><div><b>{item.actor_real_name ?? '系统'}</b><small>{item.actor_username ?? '—'}</small></div></div></td><td><Badge tone={item.action.includes('delete') || item.action.includes('ban') ? 'red' : item.action.includes('create') ? 'green' : 'blue'}>{ACTION_LABEL[item.action] ?? item.action}</Badge></td><td>{item.target_type}<small className="adm-block-id">{item.target_id.slice(0, 14)}</small></td><td className="adm-reason-cell">{item.reason || '—'}</td><td><code>{item.id.slice(0, 8)}</code></td></tr>)}</tbody></table></div>
    </section>
  );
}


