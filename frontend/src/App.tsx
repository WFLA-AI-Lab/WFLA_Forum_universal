import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Announcement, Board, Post, Thread, User } from './types';

interface Report {
  id: string;
  reporter_id: string;
  reporter_username?: string;
  target_type: 'thread' | 'post' | 'user';
  target_id: string;
  reason: string;
  details: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  created_at: string;
  updated_at: string;
}

interface Invitation {
  id: string;
  code: string;
  created_by: string | null;
  used_by: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  is_read: number;
  created_at: string;
}

type View =
  | { name: 'home' }
  | { name: 'board'; board: Board }
  | { name: 'thread'; thread: Thread }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'notifications' }
  | { name: 'admin'; tab: 'users' | 'reports' | 'invitations' | 'announcements' };

const API_ORIGIN = (import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8787/api/v1').replace(/\/api\/v1$/, '');

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replaceAll('/', '.');
}

function Field({ children }: { children: React.ReactNode }) {
  return <span className="ef-field">{children}</span>;
}

function Pair({ en, zh }: { en: string; zh: string }) {
  return (
    <div className="ef-pair">
      <span className="ef-eyebrow">{en}</span>
      <span>{zh}</span>
    </div>
  );
}

function Button({ children, onClick, type = 'button', className = '', disabled = false }: {
  children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'; className?: string; disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`ef-btn ${className}`}>
      <span>{children}</span>
    </button>
  );
}

function RecordRow({ index, title, meta, onClick }: { index: number; title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="ef-row" onClick={onClick}
      style={{ textAlign: 'left', width: '100%', display: 'grid', gridTemplateColumns: '72px 1fr minmax(140px, auto)', gap: '12px', alignItems: 'center', padding: '14px 12px', background: 'transparent', border: 0, borderTop: '1px solid var(--ef-rule)', cursor: 'pointer' }}>
      <span className="ef-field">No.{String(index).padStart(3, '0')}</span>
      <strong style={{ fontWeight: 700 }}>{title}</strong>
      <span className="ef-field" style={{ textAlign: 'right' }}>{meta}</span>
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [me, setMe] = useState<User | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // forms
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [regForm, setRegForm] = useState({ invitation_code: '', username: '', password: '', real_name: '', graduation_year: '' });
  const [reply, setReply] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  // admin
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminReports, setAdminReports] = useState<Report[]>([]);
  const [adminInvitations, setAdminInvitations] = useState<Invitation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', level: 'normal', ends_at: '' });
  const [newBoardForm, setNewBoardForm] = useState({ name: '', slug: '', description: '' });

  const activeBoard = view.name === 'board' ? view.board : null;
  const activeThread = view.name === 'thread' ? view.thread : null;
  const isStaff = me ? ['moderator', 'admin', 'owner'].includes(me.role) : false;
  const isAdmin = me ? ['admin', 'owner'].includes(me.role) : false;

  useEffect(() => { void loadBase(); }, []);

  async function loadBase() {
    try { const d = await api.get<{ user: User }>('/me'); setMe(d.user); } catch { setMe(null); }
    try { const d = await api.get<{ items: Board[] }>('/boards'); setBoards(d.items); } catch { setBoards([]); }
    try { const d = await api.get<{ items: Announcement[] }>('/announcements'); setAnnouncements(d.items); } catch { setAnnouncements([]); }
  }

  useEffect(() => {
    if (!activeBoard) return;
    api.get<{ items: Thread[] }>(`/boards/${activeBoard.slug}/threads?limit=50`)
      .then(d => setThreads(d.items)).catch(e => setError((e as Error).message));
  }, [activeBoard]);

  async function openThread(id: string) {
    try {
      const d = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${id}`);
      setPosts(d.posts);
      setView({ name: 'thread', thread: d.item });
      void api.post(`/threads/${id}/view`);
    } catch (e) { setError((e as Error).message); }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    try {
      const d = await api.post<{ user: User }>('/login', { username, password });
      setMe(d.user); setView({ name: 'home' }); setError(''); setSuccess('登录成功');
    } catch (e) { setError((e as Error).message); }
  }

  async function logout() {
    await api.post('/logout').catch(() => undefined);
    setMe(null); setView({ name: 'home' }); setSuccess('');
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post('/register', regForm);
      setSuccess('注册申请已提交，请等待管理员激活后再登录');
      setView({ name: 'login' }); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function createThread(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBoard) return;
    try {
      await api.post(`/boards/${activeBoard.slug}/threads`, { title: newTitle, content: newContent });
      const d = await api.get<{ items: Thread[] }>(`/boards/${activeBoard.slug}/threads?limit=50`);
      setThreads(d.items); setNewTitle(''); setNewContent(''); setSuccess('话题已发布');
    } catch (e) { setError((e as Error).message); }
  }

  async function createReply(event: React.FormEvent) {
    event.preventDefault();
    if (!activeThread) return;
    try {
      await api.post(`/threads/${activeThread.id}/posts`, { content: reply });
      const d = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${activeThread.id}`);
      setPosts(d.posts); setView({ name: 'thread', thread: d.item }); setReply(''); setSuccess('回复已发送');
    } catch (e) { setError((e as Error).message); }
  }

  async function submitReport(targetType: 'thread' | 'post' | 'user', targetId: string) {
    const reason = window.prompt('举报原因（如：辱骂、隐私、广告等）');
    if (!reason) return;
    const details = window.prompt('补充说明（可选）') ?? '';
    try {
      await api.post('/reports', { target_type: targetType, target_id: targetId, reason, details });
      setSuccess('举报已提交，监管者会尽快处理');
    } catch (e) { setError((e as Error).message); }
  }

  async function loadAdmin(tab: 'users' | 'reports' | 'invitations' | 'announcements') {
    try {
      if (tab === 'users') { const d = await api.get<{ items: User[] }>('/users'); setAdminUsers(d.items); }
      if (tab === 'reports') { const d = await api.get<{ items: Report[] }>('/reports'); setAdminReports(d.items); }
      if (tab === 'invitations') { const d = await api.get<{ items: Invitation[] }>('/invitations'); setAdminInvitations(d.items); }
    } catch (e) { setError((e as Error).message); }
  }

  async function loadNotifications() {
    try { const d = await api.get<{ items: Notification[] }>('/notifications'); setNotifications(d.items); } catch { setNotifications([]); }
  }

  async function activateUser(id: string) {
    try { await api.post(`/users/${id}/activate`); await loadAdmin('users'); setSuccess('用户已激活'); } catch (e) { setError((e as Error).message); }
  }

  async function setUserStatus(id: string, status: string) {
    const reason = status === 'active' ? '' : (window.prompt('操作原因') ?? '');
    try { await api.post(`/users/${id}/status`, { status, reason }); await loadAdmin('users'); setSuccess('用户状态已更新'); } catch (e) { setError((e as Error).message); }
  }

  async function resolveReport(id: string) {
    const resolution = window.prompt('处理说明');
    if (!resolution) return;
    try { await api.post(`/reports/${id}/resolve`, { resolution }); await loadAdmin('reports'); setSuccess('举报已处理'); } catch (e) { setError((e as Error).message); }
  }

  async function rejectReport(id: string) {
    const reason = window.prompt('驳回原因');
    if (!reason) return;
    try { await api.post(`/reports/${id}/reject`, { reason }); await loadAdmin('reports'); setSuccess('举报已驳回'); } catch (e) { setError((e as Error).message); }
  }

  async function createInvitation() {
    try { const d = await api.post<{ item: Invitation }>('/invitations', { ttl_hours: 168 }); await loadAdmin('invitations'); setSuccess(`邀请码已创建：${d.item.code}`); } catch (e) { setError((e as Error).message); }
  }

  async function createAnnouncement(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post('/announcements', { ...announcementForm, ends_at: announcementForm.ends_at || null });
      setAnnouncementForm({ title: '', content: '', level: 'normal', ends_at: '' });
      const d = await api.get<{ items: Announcement[] }>('/announcements'); setAnnouncements(d.items);
      setSuccess('公告已发布');
    } catch (e) { setError((e as Error).message); }
  }

  async function createBoard(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post('/boards', newBoardForm);
      const d = await api.get<{ items: Board[] }>('/boards'); setBoards(d.items);
      setNewBoardForm({ name: '', slug: '', description: '' }); setSuccess('板块已创建');
    } catch (e) { setError((e as Error).message); }
  }

  const stats = useMemo(() => ({ boards: boards.length, announcements: announcements.length }), [boards, announcements]);

  return (
    <div className="ef-page">
      <div className="ef-sheet">
        <div className="ef-tri" aria-hidden="true" />
        <header className="ef-sheet-head">
          <h1 className="ef-read">世外墙</h1>
          <Field>WFLA WALL │ {me ? `${me.real_name} / ${me.graduation_year} / ${me.role}` : '访客'}</Field>
        </header>

        <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--ef-rule)' }}>
          <Button onClick={() => setView({ name: 'home' })} className={view.name === 'home' ? 'is-active' : ''}>首页</Button>
          {boards.map(b => (
            <Button key={b.id} onClick={() => setView({ name: 'board', board: b })} className={activeBoard?.id === b.id ? 'is-active' : ''}>{b.name}</Button>
          ))}
          <span style={{ flex: 1 }} />
          {me && <Button onClick={() => { void loadNotifications(); setView({ name: 'notifications' }); }}>通知</Button>}
          {isStaff && <Button onClick={() => { setView({ name: 'admin', tab: 'users' }); void loadAdmin('users'); }}>管理</Button>}
          {me ? <Button onClick={logout}>退出</Button> : (
            <>
              <Button onClick={() => setView({ name: 'login' })}>登录</Button>
              <Button onClick={() => setView({ name: 'register' })}>注册</Button>
            </>
          )}
        </nav>

        {error && <p className="ef-note">{error}</p>}
        {success && <p className="ef-note" style={{ borderLeftColor: 'var(--ef-signal)' }}>{success}</p>}

        {view.name === 'login' && (
          <section className="ef-section">
            <Pair en="LOGIN" zh="登录" />
            <form onSubmit={login} style={{ display: 'grid', gap: '12px', maxWidth: '420px' }}>
              <label className="ef-label">用户名<input className="ef-input" value={username} onChange={e => setUsername(e.target.value)} /></label>
              <label className="ef-label">密码<input className="ef-input" type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
              <Button type="submit">登录</Button>
            </form>
            <p className="ef-field" style={{ marginTop: '16px' }}>
              也可以使用 <a href={`${API_ORIGIN}/api/v1/auth/microsoft/login`}>Microsoft 账号登录</a>（需先绑定论坛账号）
            </p>
          </section>
        )}

        {view.name === 'register' && (
          <section className="ef-section">
            <Pair en="REGISTER" zh="邀请注册" />
            <form onSubmit={register} style={{ display: 'grid', gap: '12px', maxWidth: '420px' }}>
              <label className="ef-label">邀请码<input className="ef-input" value={regForm.invitation_code} onChange={e => setRegForm({ ...regForm, invitation_code: e.target.value })} /></label>
              <label className="ef-label">用户名<input className="ef-input" value={regForm.username} onChange={e => setRegForm({ ...regForm, username: e.target.value })} /></label>
              <label className="ef-label">真实中文姓名<input className="ef-input" value={regForm.real_name} onChange={e => setRegForm({ ...regForm, real_name: e.target.value })} placeholder="例如：王小明" /></label>
              <label className="ef-label">届别<input className="ef-input" value={regForm.graduation_year} onChange={e => setRegForm({ ...regForm, graduation_year: e.target.value })} placeholder="例如：2027" /></label>
              <label className="ef-label">密码<input className="ef-input" type="password" value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} placeholder="至少10位，含大小写数字符号" /></label>
              <Button type="submit">提交注册申请</Button>
              <p className="ef-field">注册后需管理员激活账号才能登录。</p>
            </form>
          </section>
        )}

        {view.name === 'home' && (
          <>
            <section className="ef-section">
              <Pair en="ANNOUNCEMENTS" zh="公告" />
              {announcements.length === 0 ? <p className="ef-empty">还没有公告。全站重要通知会显示在这里。</p> : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {announcements.map(item => (
                    <li key={item.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '14px 0' }}>
                      <Field>{item.level.toUpperCase()} │ {formatDate(item.starts_at)}</Field>
                      <h3 style={{ fontWeight: 700, margin: '6px 0' }}>{item.title}</h3>
                      <div className="ef-prose" dangerouslySetInnerHTML={{ __html: item.content_html }} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="ef-section">
              <Pair en="BOARDS" zh="板块" />
              <ul className="ef-ledger">
                <li><span>板块数量</span><Field>{stats.boards}</Field></li>
                {boards.map(b => <li key={b.id}><span>{b.name}</span><Field>{b.description}</Field></li>)}
              </ul>
            </section>
          </>
        )}

        {view.name === 'board' && activeBoard && (
          <section className="ef-section">
            <Pair en={activeBoard.slug.toUpperCase()} zh={activeBoard.name} />
            <Field>{activeBoard.description} │ {threads.length} 个话题</Field>
            {threads.length === 0 ? <p className="ef-empty">还没有话题。</p> : threads.map((t, i) => (
              <RecordRow key={t.id} index={i + 1} title={t.title}
                meta={`${t.author?.real_name ?? '?'} / ${t.author?.graduation_year ?? '--'} │ ${t.reply_count} 回复 │ ${formatDate(t.last_activity_at)}`}
                onClick={() => void openThread(t.id)} />
            ))}
            {me ? (
              <form onSubmit={createThread} style={{ display: 'grid', gap: '12px', maxWidth: '720px', paddingTop: '24px' }}>
                <Pair en="NEW THREAD" zh="发起话题" />
                <label className="ef-label">标题<input className="ef-input" value={newTitle} onChange={e => setNewTitle(e.target.value)} /></label>
                <label className="ef-label">正文<textarea className="ef-input" rows={6} value={newContent} onChange={e => setNewContent(e.target.value)} /></label>
                <Button type="submit">发布</Button>
              </form>
            ) : <p className="ef-note">登录后可以发起话题。</p>}
          </section>
        )}

        {view.name === 'thread' && activeThread && (
          <section className="ef-section">
            <Pair en={`THREAD / ${activeThread.id.slice(0, 8).toUpperCase()}`} zh={activeThread.title} />
            <Field>{activeThread.author?.real_name} / {activeThread.author?.graduation_year} │ {activeThread.reply_count} 回复 │ {activeThread.view_count} 次浏览</Field>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {me && <Button onClick={() => void submitReport('thread', activeThread.id)}>举报话题</Button>}
            </div>
            <div style={{ marginTop: '16px' }}>
              {posts.map(post => (
                <article key={post.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <Field>No.{post.floor_number} │ {post.author?.real_name} / {post.author?.graduation_year} │ {formatDate(post.created_at)}</Field>
                    {me && post.author_id !== me.id && <Button onClick={() => void submitReport('post', post.id)}>举报</Button>}
                  </div>
                  <div className="ef-prose" dangerouslySetInnerHTML={{ __html: post.content_html }} />
                </article>
              ))}
            </div>
            {me ? (
              <form onSubmit={createReply} style={{ display: 'grid', gap: '12px', maxWidth: '720px', paddingTop: '24px' }}>
                <label className="ef-label">回复<textarea className="ef-input" rows={4} value={reply} onChange={e => setReply(e.target.value)} /></label>
                <Button type="submit">发送回复</Button>
              </form>
            ) : <p className="ef-note">登录后可以参与讨论。</p>}
          </section>
        )}

        {view.name === 'notifications' && (
          <section className="ef-section">
            <Pair en="NOTIFICATIONS" zh="通知" />
            {me && <Button onClick={() => { void api.post('/notifications/read-all').then(loadNotifications); }}>全部已读</Button>}
            {notifications.length === 0 ? <p className="ef-empty">暂无通知。</p> : notifications.map(n => (
              <div key={n.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '12px 0', opacity: n.is_read ? 0.6 : 1 }}>
                <Field>{n.type.toUpperCase()} │ {formatDate(n.created_at)}</Field>
                <p style={{ fontWeight: 700, margin: '4px 0' }}>{n.title}</p>
                <p>{n.body}</p>
              </div>
            ))}
          </section>
        )}

        {view.name === 'admin' && isStaff && (
          <section className="ef-section">
            <Pair en="CONSOLE" zh="管理后台" />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {(['users','reports','invitations','announcements'] as const).map(tab => (
                <Button key={tab} onClick={() => { setView({ name: 'admin', tab }); void loadAdmin(tab); }}
                  className={view.tab === tab ? 'is-active' : ''}>
                  {{ users: '用户', reports: '举报', invitations: '邀请码', announcements: '公告/板块' }[tab]}
                </Button>
              ))}
            </div>

            {view.tab === 'users' && (
              <div>
                <Pair en="USERS" zh="用户管理" />
                {adminUsers.map(u => (
                  <div key={u.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong>{u.real_name}</strong> <Field>{u.username} / {u.graduation_year} / {u.role} / {u.status}</Field>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {u.status === 'pending' && isAdmin && <Button onClick={() => void activateUser(u.id)}>激活</Button>}
                      {u.status === 'active' && u.id !== me?.id && <Button onClick={() => void setUserStatus(u.id, 'muted')}>禁言</Button>}
                      {u.status === 'active' && u.id !== me?.id && <Button onClick={() => void setUserStatus(u.id, 'banned')}>封禁</Button>}
                      {(u.status === 'muted' || u.status === 'banned') && <Button onClick={() => void setUserStatus(u.id, 'active')}>恢复</Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view.tab === 'reports' && (
              <div>
                <Pair en="REPORTS" zh="举报队列" />
                {adminReports.length === 0 ? <p className="ef-empty">暂无举报。</p> : adminReports.map(r => (
                  <div key={r.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <Field>{r.status.toUpperCase()} │ {r.target_type} │ {formatDate(r.created_at)}</Field>
                      {r.status !== 'resolved' && r.status !== 'rejected' && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Button onClick={() => void resolveReport(r.id)}>处理</Button>
                          <Button onClick={() => void rejectReport(r.id)}>驳回</Button>
                        </div>
                      )}
                    </div>
                    <p style={{ fontWeight: 700, margin: '6px 0' }}>{r.reason}</p>
                    {r.details && <p>{r.details}</p>}
                    <Field>目标：{r.target_id}</Field>
                  </div>
                ))}
              </div>
            )}

            {view.tab === 'invitations' && (
              <div>
                <Pair en="INVITATIONS" zh="邀请码管理" />
                {isAdmin && <Button onClick={() => void createInvitation()}>生成新邀请码</Button>}
                {adminInvitations.map(inv => (
                  <div key={inv.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '10px 0' }}>
                    <Field>{inv.used_by ? '已使用' : '未使用'} │ {inv.expires_at ? `过期：${formatDate(inv.expires_at)}` : '永久'} │ 创建：{formatDate(inv.created_at)}</Field>
                    <p style={{ fontFamily: 'monospace', fontSize: '13px', margin: '6px 0', wordBreak: 'break-all' }}>{inv.code}</p>
                  </div>
                ))}
              </div>
            )}

            {view.tab === 'announcements' && (
              <div>
                <Pair en="ANNOUNCEMENTS" zh="发布公告" />
                {isAdmin ? (
                  <form onSubmit={createAnnouncement} style={{ display: 'grid', gap: '12px', maxWidth: '720px' }}>
                    <label className="ef-label">标题<input className="ef-input" value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} /></label>
                    <label className="ef-label">内容<textarea className="ef-input" rows={5} value={announcementForm.content} onChange={e => setAnnouncementForm({ ...announcementForm, content: e.target.value })} /></label>
                    <label className="ef-label">级别
                      <select className="ef-input" value={announcementForm.level} onChange={e => setAnnouncementForm({ ...announcementForm, level: e.target.value })}>
                        <option value="normal">普通</option>
                        <option value="important">重要</option>
                        <option value="urgent">紧急</option>
                      </select>
                    </label>
                    <label className="ef-label">结束时间（可选）<input className="ef-input" type="datetime-local" value={announcementForm.ends_at} onChange={e => setAnnouncementForm({ ...announcementForm, ends_at: e.target.value })} /></label>
                    <Button type="submit">发布公告</Button>
                  </form>
                ) : <p className="ef-note">只有管理员可以发布公告。</p>}

                {isAdmin && (
                  <form onSubmit={createBoard} style={{ display: 'grid', gap: '12px', maxWidth: '720px', marginTop: '32px' }}>
                    <Pair en="BOARDS" zh="创建板块" />
                    <label className="ef-label">名称<input className="ef-input" value={newBoardForm.name} onChange={e => setNewBoardForm({ ...newBoardForm, name: e.target.value })} /></label>
                    <label className="ef-label">标识<input className="ef-input" value={newBoardForm.slug} onChange={e => setNewBoardForm({ ...newBoardForm, slug: e.target.value })} placeholder="小写字母和连字符" /></label>
                    <label className="ef-label">描述<input className="ef-input" value={newBoardForm.description} onChange={e => setNewBoardForm({ ...newBoardForm, description: e.target.value })} /></label>
                    <Button type="submit">创建板块</Button>
                  </form>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
