import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { User } from '../skins/contract';
import { Badge, formatDate } from './shared';

const ROLE_LABEL: Record<string, string> = { owner: '负责人', admin: '管理员', moderator: '监管者', member: '成员' };
const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };
const STATUS_LABEL: Record<string, string> = { active: '正常', pending: '待激活', muted: '已禁言', banned: '已封禁', deleted: '已删除' };
type Notify = (tone: 'success' | 'error', message: string) => void;
interface AdminUser extends User { session_count?: number; thread_count?: number; post_count?: number; oauth_providers?: string | null }
interface UserDetail { user: AdminUser; oauth_accounts: { provider: string; email: string | null; linked_at: string }[]; notes: { id: string; body: string; created_at: string; author_real_name: string | null }[]; sanctions: { id: string; action: string; reason: string; created_at: string; actor_real_name: string | null }[]; counts: { sessions?: number; threads?: number; posts?: number } }

function randomPassword() { const bytes = new Uint32Array(3); crypto.getRandomValues(bytes); return `Wf!${bytes[0].toString(36)}${bytes[1].toString(36)}${bytes[2].toString(36)}A9`; }
function statusTone(status: string) { if (status === 'active') return 'green'; if (status === 'pending' || status === 'muted') return 'orange'; if (status === 'banned' || status === 'deleted') return 'red'; return 'neutral'; }

export function UsersPanel({ me, notify }: { me: User; notify: Notify }) {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', real_name: '', enrollment_year: '2026', password: randomPassword(), role: 'member' });
  const params = useMemo(() => {
    const value = new URLSearchParams({ limit: '150' });
    if (query.trim()) value.set('query', query.trim());
    if (role) value.set('role', role);
    if (status) value.set('status', status);
    return value.toString();
  }, [query, role, status]);

  async function load() {
    try {
      const data = await api.get<{ items: AdminUser[]; total: number }>(`/admin/users?${params}`);
      setItems(data.items); setTotal(data.total);
    } catch (error) { notify('error', error instanceof Error ? error.message : '无法加载账号'); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [params]);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    api.get<UserDetail>(`/admin/users/${selected}`).then(setDetail).catch(error => notify('error', error instanceof Error ? error.message : '无法加载详情'));
  }, [selected]);

  async function run(task: () => Promise<unknown>, message: string): Promise<boolean> {
    try { await task(); notify('success', message); return true; }
    catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); return false; }
  }
  async function refreshDetail() {
    if (!selected) return;
    setDetail(await api.get<UserDetail>(`/admin/users/${selected}`));
    await load();
  }
  async function createUser() {
    if (await run(() => api.post('/users', { ...newUser, enrollment_year: Number(newUser.enrollment_year) }), '账号已创建并立即生效')) {
      setCreating(false);
      setNewUser({ username: '', real_name: '', enrollment_year: '2026', password: randomPassword(), role: 'member' });
      await load();
    }
  }
  const manageable = Boolean(detail && detail.user.id !== me.id && ROLE_RANK[detail.user.role] < ROLE_RANK[me.role]);

  return (
    <>
      <section className="adm-toolbar">
        <div className="adm-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索用户名、真实姓名" aria-label="搜索账号" />{query && <button type="button" onClick={() => setQuery('')}>×</button>}</div>
        <select value={role} onChange={e => setRole(e.target.value)}><option value="">全部角色</option>{Object.keys(ROLE_LABEL).filter(value => value !== 'owner' || me.role === 'owner').map(value => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" className="adm-primary push" onClick={() => setCreating(true)}>＋ 创建账号</button>
      </section>
      <section className="adm-card adm-table-card">
        <header><div><small>{total} ACCOUNTS</small><h3>账号与权限</h3></div><span className="adm-permission-note">你只能管理低于「{ROLE_LABEL[me.role]}」的账号</span></header>
        <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>账号</th><th>入学届别</th><th>角色</th><th>状态</th><th>登录渠道</th><th>活跃会话</th><th>内容</th><th /></tr></thead>
          <tbody>{items.length === 0 ? <tr><td colSpan={8}><div className="adm-empty"><span>○</span><p>没有符合条件的账号</p></div></td></tr> : items.map(user => (
            <tr key={user.id} className={selected === user.id ? 'selected' : ''}>
              <td><div className="adm-user-cell"><span className="adm-avatar">{user.real_name.slice(-1)}</span><div><b>{user.real_name}</b><small>@{user.username}</small></div></div></td>
              <td>{user.enrollment_year} 届</td>
              <td><Badge tone={user.role === 'owner' ? 'blue' : user.role === 'admin' ? 'orange' : 'neutral'}>{ROLE_LABEL[user.role]}</Badge></td>
              <td><Badge tone={statusTone(user.status)}>{STATUS_LABEL[user.status]}</Badge></td>
              <td><span className="adm-oauth-mini">{user.oauth_providers ? user.oauth_providers.split(',').map(provider => <i key={provider}>{provider === 'github' ? 'GH' : 'MS'}</i>) : '—'}</span></td>
              <td>{user.session_count ?? 0}</td>
              <td><span className="adm-mini-count">{user.thread_count ?? 0} 话题 / {user.post_count ?? 0} 回复</span></td>
              <td><button type="button" className="adm-row-action" onClick={() => { setSelected(user.id); setReason(''); setNote(''); setTempPassword(''); }}>管理</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {creating && <div className="adm-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCreating(false); }}>
        <section className="adm-sheet" role="dialog" aria-modal="true">
          <header><div><small>PROVISION ACCOUNT</small><h2>创建内测账号</h2><p>只能创建低于「{ROLE_LABEL[me.role]}」权限的账号。</p></div><button type="button" aria-label="关闭" onClick={() => setCreating(false)}>×</button></header>
          <div className="adm-form-grid">
            <label className="adm-field"><span>用户名</span><input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} autoComplete="off" /></label>
            <label className="adm-field"><span>真实中文姓名</span><input value={newUser.real_name} onChange={e => setNewUser({ ...newUser, real_name: e.target.value })} autoComplete="off" /></label>
            <label className="adm-field"><span>入学年份（届别）</span><input value={newUser.enrollment_year} onChange={e => setNewUser({ ...newUser, enrollment_year: e.target.value })} inputMode="numeric" /></label>
            <label className="adm-field"><span>角色</span><select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>{(['member', 'moderator', 'admin'] as const).filter(value => ROLE_RANK[value] < ROLE_RANK[me.role]).map(value => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}</select></label>
            <label className="adm-field full"><span>初始密码</span><div className="adm-password-field"><input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} autoComplete="new-password" /><button type="button" onClick={() => setNewUser({ ...newUser, password: randomPassword() })}>重新生成</button><button type="button" onClick={() => void navigator.clipboard?.writeText(newUser.password)}>复制</button></div></label>
          </div>
          <footer><button type="button" className="adm-secondary" onClick={() => setCreating(false)}>取消</button><button type="button" className="adm-primary" disabled={newUser.username.length < 3 || newUser.real_name.length < 2 || newUser.password.length < 10} onClick={() => void createUser()}>创建并启用</button></footer>
        </section>
      </div>}
      {selected && <div className="adm-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
        {!detail ? <section className="adm-sheet"><div className="adm-skeleton"><span /><span /><span /></div></section> : <section className="adm-sheet user" role="dialog" aria-modal="true">
          <header><div className="adm-sheet-user"><span className="adm-avatar large">{detail.user.real_name.slice(-1)}</span><div><small>{detail.user.enrollment_year} 届 · @{detail.user.username}</small><h2>{detail.user.real_name}</h2><p>创建于 {formatDate(detail.user.created_at)}</p></div></div><button type="button" aria-label="关闭" onClick={() => setSelected(null)}>×</button></header>
          {!manageable && <div className="adm-locked-note">你不能管理同级、更高权限或自己的账号。</div>}
          <div className="adm-detail-stats"><div><b>{detail.counts.threads ?? 0}</b><span>话题</span></div><div><b>{detail.counts.posts ?? 0}</b><span>回复</span></div><div><b>{detail.counts.sessions ?? 0}</b><span>活跃会话</span></div><div><b>{detail.oauth_accounts.length}</b><span>第三方绑定</span></div></div>
          <section className="adm-sheet-section"><header><h3>身份与权限</h3><Badge tone={statusTone(detail.user.status)}>{STATUS_LABEL[detail.user.status]}</Badge></header>
            <div className="adm-detail-grid"><div><span>真实姓名</span><b>{detail.user.real_name}</b></div><div><span>用户名</span><b>@{detail.user.username}</b></div><div><span>入学届别</span><b>{detail.user.enrollment_year}</b></div><div><span>当前角色</span><b>{ROLE_LABEL[detail.user.role]}</b></div></div>
            {manageable && <div className="adm-action-block"><label className="adm-field"><span>操作原因</span><input value={reason} onChange={e => setReason(e.target.value)} placeholder="封禁、禁言或变更权限时填写" /></label>
              <div className="adm-action-row">
                <select value="" onChange={e => { if (e.target.value) void run(() => api.post(`/users/${detail.user.id}/role`, { role: e.target.value, reason: reason || '管理后台变更角色' }), '角色已更新').then(ok => { if (ok) void refreshDetail(); }); }}><option value="">即时变更权限…</option>{(['member', 'moderator', 'admin'] as const).filter(value => ROLE_RANK[value] < ROLE_RANK[me.role]).map(value => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}</select>
                {detail.user.status === 'pending' && <button type="button" className="adm-primary" onClick={() => void run(() => api.post(`/users/${detail.user.id}/activate`), `账号已激活为${ROLE_LABEL[detail.user.role]}`).then(ok => { if (ok) void refreshDetail(); })}>审核并激活</button>}{detail.user.status !== 'active' && detail.user.status !== 'pending' && <button type="button" className="adm-secondary" onClick={() => void run(() => api.post(`/users/${detail.user.id}/status`, { status: 'active', reason }), '账号已恢复').then(ok => { if (ok) void refreshDetail(); })}>恢复</button>}
                {detail.user.status === 'active' && <button type="button" className="adm-secondary" onClick={() => reason.trim().length > 1 && void run(() => api.post(`/users/${detail.user.id}/status`, { status: 'muted', reason }), '账号已禁言').then(ok => { if (ok) void refreshDetail(); })}>禁言</button>}
                {detail.user.status !== 'banned' && <button type="button" className="adm-danger-ghost" onClick={() => reason.trim().length > 1 && void run(() => api.post(`/users/${detail.user.id}/status`, { status: 'banned', reason }), '账号已封禁').then(ok => { if (ok) void refreshDetail(); })}>封禁</button>}
                <button type="button" className="adm-secondary" onClick={() => void run(() => api.post(`/admin/users/${detail.user.id}/sessions/revoke`), '全部会话已撤销').then(ok => { if (ok) void refreshDetail(); })}>强制退出</button>
              </div>
            </div>}
          </section>
          <section className="adm-sheet-section"><header><h3>第三方登录</h3></header><div className="adm-provider-list">{detail.oauth_accounts.length === 0 ? <div className="adm-empty"><span>○</span><p>尚未绑定第三方账号</p></div> : detail.oauth_accounts.map(account => <div key={account.provider}><i>{account.provider === 'github' ? 'GH' : 'MS'}</i><div><b>{account.provider === 'github' ? 'GitHub' : 'Microsoft'}</b><small>{account.email ?? '未提供邮箱'}</small></div><span>{formatDate(account.linked_at)}</span></div>)}</div></section>
          {manageable && <section className="adm-sheet-section"><header><h3>重置登录密码</h3></header><div className="adm-password-field"><input value={tempPassword} onChange={e => setTempPassword(e.target.value)} placeholder="输入临时密码" autoComplete="new-password" /><button type="button" onClick={() => setTempPassword(randomPassword())}>生成</button><button type="button" onClick={() => tempPassword.length >= 10 && void run(() => api.post(`/users/${detail.user.id}/password`, { password: tempPassword }), '密码已重置').then(ok => { if (ok) setTempPassword(''); })}>应用</button></div></section>}
          <section className="adm-sheet-section"><header><h3>管理备注</h3></header>{manageable && <div className="adm-note-compose"><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="记录沟通情况、风险观察或处置上下文" /><button type="button" className="adm-primary" onClick={() => note.trim().length > 1 && void run(() => api.post(`/admin/users/${detail.user.id}/notes`, { body: note }), '备注已保存').then(ok => { if (ok) { setNote(''); void refreshDetail(); } })}>保存备注</button></div>}<div className="adm-note-list">{detail.notes.length === 0 ? <div className="adm-empty"><span>○</span><p>暂无管理备注</p></div> : detail.notes.map(item => <div key={item.id}><p>{item.body}</p><small>{item.author_real_name ?? '管理员'} · {formatDate(item.created_at)}</small></div>)}</div></section>
        </section>}
      </div>}
    </>
  );
}
