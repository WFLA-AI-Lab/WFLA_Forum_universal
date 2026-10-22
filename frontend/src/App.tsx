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

type AdminTab = 'users' | 'reports' | 'invitations' | 'announcements';

type View =
  | { name: 'home' }
  | { name: 'board'; board: Board }
  | { name: 'thread'; thread: Thread }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'notifications' }
  | { name: 'admin'; tab: AdminTab };

const API_ORIGIN = (import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8787/api/v1').replace(/\/api\/v1$/, '');

const ROLE_LABEL: Record<string, string> = { owner: '负责人', admin: '管理员', moderator: '监管者', member: '成员' };
const LEVEL_LABEL: Record<string, string> = { normal: '普通', important: '重要', urgent: '紧急' };
const ADMIN_TABS: { key: AdminTab; en: string; zh: string }[] = [
  { key: 'users', en: 'USERS', zh: '用户' },
  { key: 'reports', en: 'REPORTS', zh: '举报' },
  { key: 'invitations', en: 'INVITATIONS', zh: '邀请码' },
  { key: 'announcements', en: 'POSTS & BOARDS', zh: '公告与板块' }
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replaceAll('/', '.');
}

/* ---------- primitives ---------- */

function Field({ children }: { children: React.ReactNode }) {
  return <span className="ef-field">{children}</span>;
}

function Pair({ en, zh }: { en: string; zh: string }) {
  return (
    <div className="ef-pair">
      <span className="ef-eyebrow slash">{en}</span>
      <span>{zh}</span>
    </div>
  );
}

function Btn({ children, onClick, type = 'button', go = false, small = false, danger = false, disabled = false }: {
  children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  go?: boolean; small?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const cls = ['ef-btn', go ? 'go' : '', small ? 'small' : '', danger ? 'danger' : ''].filter(Boolean).join(' ');
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}><span>{children}</span></button>;
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function StateTag({ label, alert = false, draft = false }: { label: string; alert?: boolean; draft?: boolean }) {
  return <span className={`ef-state${alert ? ' is-alert' : ''}${draft ? ' is-draft' : ''}`}>{label}</span>;
}

function Notice({ flag, children }: { flag: string; children: React.ReactNode }) {
  return <p className="ef-notice" data-flag={flag}>{children}</p>;
}

/* ---------- app ---------- */

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [me, setMe] = useState<User | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [regForm, setRegForm] = useState({ invitation_code: '', username: '', password: '', real_name: '', graduation_year: '' });
  const [reply, setReply] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

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
  const adminTab = view.name === 'admin' ? view.tab : null;

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

  useEffect(() => {
    if (!adminTab || !isStaff) return;
    void loadAdmin(adminTab);
  }, [adminTab, isStaff]);

  async function openThread(id: string) {
    try {
      const d = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${id}`);
      setPosts(d.posts);
      setView({ name: 'thread', thread: d.item });
      setError(''); setSuccess('');
      void api.post(`/threads/${id}/view`);
    } catch (e) { setError((e as Error).message); }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    try {
      const d = await api.post<{ user: User }>('/login', { username, password });
      setMe(d.user); setView({ name: 'home' }); setError(''); setSuccess('登录成功');
      setUsername(''); setPassword('');
    } catch (e) { setError((e as Error).message); }
  }

  async function logout() {
    await api.post('/logout').catch(() => undefined);
    setMe(null); setView({ name: 'home' }); setSuccess(''); setError('');
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post('/register', { ...regForm, graduation_year: Number(regForm.graduation_year) });
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
      setThreads(d.items); setNewTitle(''); setNewContent(''); setSuccess('话题已发布'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function createReply(event: React.FormEvent) {
    event.preventDefault();
    if (!activeThread) return;
    try {
      await api.post(`/threads/${activeThread.id}/posts`, { content: reply });
      const d = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${activeThread.id}`);
      setPosts(d.posts); setView({ name: 'thread', thread: d.item }); setReply(''); setSuccess('回复已发送'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function submitReport(targetType: 'thread' | 'post' | 'user', targetId: string) {
    const reason = window.prompt('举报原因（如：辱骂、隐私、广告等）');
    if (!reason) return;
    const details = window.prompt('补充说明（可选）') ?? '';
    try {
      await api.post('/reports', { target_type: targetType, target_id: targetId, reason, details });
      setSuccess('举报已提交，监管者会尽快处理'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function loadAdmin(tab: AdminTab) {
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
      await api.post('/announcements', { ...announcementForm, ends_at: announcementForm.ends_at ? new Date(announcementForm.ends_at).toISOString() : null });
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

  const pendingCount = useMemo(() => adminUsers.filter(u => u.status === 'pending').length, [adminUsers]);
  const openReports = useMemo(() => adminReports.filter(r => r.status === 'open' || r.status === 'in_review').length, [adminReports]);
  const unusedInvitations = useMemo(() => adminInvitations.filter(i => !i.used_by).length, [adminInvitations]);
  const totalReplies = useMemo(() => threads.reduce((sum, t) => sum + t.reply_count, 0), [threads]);

  function goAdmin(tab: AdminTab) {
    setView({ name: 'admin', tab });
    setError(''); setSuccess('');
  }

  function go(name: 'home' | 'login' | 'register' | 'notifications') {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      if (name === 'notifications') void loadNotifications();
      setView({ name } as View);
      setError(''); setSuccess('');
    };
  }

  return (
    <>
      {/* ======= command bar ======= */}
      <header className="ef-cmdbar">
        <button type="button" className="brand" onClick={() => { setView({ name: 'home' }); setError(''); setSuccess(''); }}
          style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
          <span className="seal">世</span>
          WFLA WALL
        </button>
        <nav>
          <a href="#" aria-current={view.name === 'home' ? 'page' : undefined} onClick={go('home')}>
            <small>HOME</small>首页
          </a>
          {boards.map(b => (
            <a key={b.id} href="#" aria-current={activeBoard?.id === b.id ? 'page' : undefined}
              onClick={e => { e.preventDefault(); setView({ name: 'board', board: b }); setError(''); setSuccess(''); }}>
              <small>{b.slug.toUpperCase()}</small>{b.name}
            </a>
          ))}
          {me && (
            <a href="#" aria-current={view.name === 'notifications' ? 'page' : undefined} onClick={go('notifications')}>
              <small>NOTICES</small>通知
            </a>
          )}
          {isStaff && (
            <a href="#" aria-current={view.name === 'admin' ? 'page' : undefined}
              onClick={e => { e.preventDefault(); goAdmin('users'); }}>
              <small>CONSOLE</small>管理
            </a>
          )}
        </nav>
        <div className="util">
          {me ? (
            <>
              <span>{me.real_name} │ {me.graduation_year} 届 │ {ROLE_LABEL[me.role] ?? me.role}</span>
              <Btn small onClick={logout}>退出</Btn>
            </>
          ) : (
            <>
              <span>访客模式 │ 可浏览公开内容</span>
              <Btn small onClick={() => { setView({ name: 'login' }); setError(''); setSuccess(''); }}>登录</Btn>
              <Btn small go onClick={() => { setView({ name: 'register' }); setError(''); setSuccess(''); }}>注册</Btn>
            </>
          )}
        </div>
      </header>

      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 3rem) 4rem' }}>
        {error && <div style={{ marginTop: '1rem' }}><Notice flag="出错">{error}</Notice></div>}
        {success && <div style={{ marginTop: '1rem' }}><Notice flag="完成">{success}</Notice></div>}

        {/* ======= home / showcase ======= */}
        {view.name === 'home' && (
          <main>
            <div className="ef-tri ef-in-sweep" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2rem', alignItems: 'end', padding: '2.5rem 0 2rem' }}>
              <div>
                <p className="ef-eyebrow slash ef-in-power" style={{ '--i': 0 } as React.CSSProperties}>SHANGHAI WORLD FOREIGN LANGUAGE ACADEMY</p>
                <h1 className="ef-wordmark ef-in-power" style={{ '--i': 1 } as React.CSSProperties}>
                  <span className="solid">WFLA</span>
                  <span className="hollow">.WALL</span>
                </h1>
                <p className="ef-in-power" style={{ '--i': 2, maxWidth: '34rem', marginTop: '1rem' } as React.CSSProperties}>
                  世外中学校园论坛。<span className="ef-marker">实名发帖，届别公开，游客可读</span>——这里是全校的公告栏、讨论区和回音壁。
                </p>
              </div>
              <span className="ef-hollow-no" aria-hidden="true" style={{ fontSize: 'clamp(4rem, 9vw, 8rem)' }}>
                {String(boards.length).padStart(2, '0')}
              </span>
            </div>

            <div className="ef-facts" style={{ marginBottom: '2.5rem' }}>
              <Field>{boards.length} 个板块</Field>
              <Field>{announcements.length} 条公告</Field>
              <Field>{me ? `当前：${me.real_name} / ${me.graduation_year} 届` : '当前：访客'}</Field>
            </div>

            {announcements.length > 0 && (
              <div className="ef-ticker" style={{ marginBottom: '3rem' }} aria-label="最新公告">
                <div className="track">
                  <ul>
                    {announcements.map(a => (
                      <li key={a.id}><a href="#announcements" onClick={e => e.preventDefault()}><b>公告</b>{a.title}<span style={{ opacity: 0.65, fontSize: '0.8em' }}>{formatDate(a.starts_at)}</span></a></li>
                    ))}
                  </ul>
                  <ul aria-hidden="true">
                    {announcements.map(a => (
                      <li key={`${a.id}-dup`}><a href="#announcements" onClick={e => e.preventDefault()} tabIndex={-1}><b>公告</b>{a.title}<span style={{ opacity: 0.65, fontSize: '0.8em' }}>{formatDate(a.starts_at)}</span></a></li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <h2 className="ef-bar-title">板块</h2>
            {boards.length === 0 ? (
              <p className="ef-empty">板块正在准备中，开放后会列在这里。</p>
            ) : (
              <ul className="ef-records" style={{ marginBottom: '3rem' }}>
                {boards.map((b, i) => (
                  <li key={b.id}>
                    <a className="ef-record" href="#" onClick={e => { e.preventDefault(); setView({ name: 'board', board: b }); setError(''); setSuccess(''); }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      <span className="ef-field">{b.slug.toUpperCase()}</span>
                      <span className="name" style={{ fontWeight: 700 }}>{b.name}
                        <span style={{ display: 'block', fontWeight: 400, fontSize: '0.85rem', color: 'var(--ef-ink-2)' }}>{b.description}</span>
                      </span>
                      <span className="ef-field">进入 →</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="ef-bar-title" id="announcements">公告</h2>
            {announcements.length === 0 ? (
              <p className="ef-empty">还没有公告。版本维护、全站规则等重要通知会显示在这里。</p>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
                {announcements.map((a, i) => (
                  <article key={a.id} className="ef-panel cut-br" style={{ padding: '1.4rem 1.5rem', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      {a.level !== 'normal'
                        ? <StateTag label={LEVEL_LABEL[a.level] ?? a.level} alert />
                        : <span className="ef-tag">{LEVEL_LABEL[a.level] ?? a.level}</span>}
                      <Field>{formatDate(a.starts_at)}{a.ends_at ? ` │ 截止 ${formatDate(a.ends_at)}` : ''}</Field>
                      <Field>{a.author_real_name} / {a.author_graduation_year} 届</Field>
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem', fontWeight: 800, fontSize: '1.15rem' }}>{a.title}</h3>
                    <div className="ef-prose" dangerouslySetInnerHTML={{ __html: a.content_html }} />
                  </article>
                ))}
              </div>
            )}
          </main>
        )}

        {/* ======= board / reading ======= */}
        {view.name === 'board' && activeBoard && (
          <main style={{ maxWidth: '48rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem' }}>
              <Pair en={activeBoard.slug.toUpperCase()} zh={activeBoard.name} />
              <Field>{activeBoard.description} │ {threads.length} 个话题 │ {totalReplies} 条回复</Field>
            </div>

            {threads.length === 0 ? (
              <p className="ef-empty" style={{ marginTop: '1.5rem' }}>这个板块还没有话题。{me ? '发布第一个话题，从下面的表单开始。' : '登录后可以发布第一个话题。'}</p>
            ) : (
              <ul className="ef-records" style={{ marginTop: '1.5rem' }}>
                {threads.map((t, i) => (
                  <li key={t.id}>
                    <a className="ef-record" href="#" onClick={e => { e.preventDefault(); void openThread(t.id); }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      <span className="ef-field">{formatDate(t.last_activity_at).slice(5, 10)}</span>
                      <span className="name" style={{ fontWeight: 700 }}>
                        {t.is_pinned && <span className="ef-tag" style={{ marginRight: '0.5em' }}>置顶</span>}
                        {t.title}
                        <span style={{ display: 'block', fontWeight: 400, fontSize: '0.85rem', color: 'var(--ef-ink-2)' }}>{t.author?.real_name ?? '?'} / {t.author?.graduation_year ?? '--'} 届</span>
                      </span>
                      <span className="ef-field">{t.reply_count} 回复 │ {t.view_count} 浏览</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--ef-ink)' }}>
              {me ? (
                <form className="ef-form" onSubmit={createThread} style={{ display: 'grid', gap: '1rem' }}>
                  <Pair en="NEW THREAD" zh="发起话题" />
                  <FormField label="标题"><input value={newTitle} onChange={e => setNewTitle(e.target.value)} required /></FormField>
                  <FormField label="正文"><textarea rows={6} value={newContent} onChange={e => setNewContent(e.target.value)} required /></FormField>
                  <div><Btn go type="submit">发布话题</Btn></div>
                </form>
              ) : (
                <Notice flag="提示">游客可以浏览，登录后才能在「{activeBoard.name}」发起话题。</Notice>
              )}
            </div>
          </main>
        )}

        {/* ======= thread / reading ======= */}
        {view.name === 'thread' && activeThread && (
          <main style={{ maxWidth: '48rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem' }}>
              <Pair en={`THREAD / ${activeThread.id.slice(0, 8).toUpperCase()}`} zh={activeThread.title} />
              <Field>
                {activeThread.author?.real_name} / {activeThread.author?.graduation_year} 届 │ {activeThread.reply_count} 回复 │ {activeThread.view_count} 次浏览 │ 最后活动 {formatDate(activeThread.last_activity_at)}
              </Field>
              {me && (
                <div style={{ marginTop: '0.75rem' }}>
                  <Btn small onClick={() => void submitReport('thread', activeThread.id)}>举报话题</Btn>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              {posts.map(post => (
                <article key={post.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '1.25rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <Field>
                      No.{String(post.floor_number).padStart(3, '0')} │ {post.author?.real_name} / {post.author?.graduation_year} 届
                      {post.author && ['owner', 'admin', 'moderator'].includes(post.author.role) && ` │ ${ROLE_LABEL[post.author.role]}`}
                      {' │ '}{formatDate(post.created_at)}
                    </Field>
                    {me && post.author_id !== me.id && <Btn small onClick={() => void submitReport('post', post.id)}>举报</Btn>}
                  </div>
                  <div className="ef-prose" dangerouslySetInnerHTML={{ __html: post.content_html }} />
                </article>
              ))}
            </div>

            <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--ef-ink)' }}>
              {me ? (
                <form className="ef-form" onSubmit={createReply} style={{ display: 'grid', gap: '1rem' }}>
                  <Pair en="REPLY" zh="写下回复" />
                  <FormField label="内容"><textarea rows={4} value={reply} onChange={e => setReply(e.target.value)} required /></FormField>
                  <div><Btn go type="submit">发送回复</Btn></div>
                </form>
              ) : (
                <Notice flag="提示">登录后可以参与这个讨论。</Notice>
              )}
            </div>
          </main>
        )}

        {/* ======= login ======= */}
        {view.name === 'login' && (
          <main style={{ maxWidth: '26rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem' }}>
              <Pair en="SIGN IN" zh="登录" />
            </div>
            <form className="ef-form" onSubmit={login} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              <FormField label="用户名"><input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" /></FormField>
              <FormField label="密码"><input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></FormField>
              <div><Btn go type="submit">登录</Btn></div>
            </form>
            <p className="ef-field" style={{ marginTop: '1.5rem' }}>
              也可以使用 <a href={`${API_ORIGIN}/api/v1/auth/microsoft/login`}>Microsoft 账号登录</a>（需先绑定论坛账号）
            </p>
          </main>
        )}

        {/* ======= register ======= */}
        {view.name === 'register' && (
          <main style={{ maxWidth: '26rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem' }}>
              <Pair en="REGISTER" zh="邀请注册" />
              <Field>注册采用邀请制 │ 提交后需管理员手动激活</Field>
            </div>
            <form className="ef-form" onSubmit={register} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              <FormField label="邀请码" hint="向管理组（AI Lab / Computerization）索取"><input value={regForm.invitation_code} onChange={e => setRegForm({ ...regForm, invitation_code: e.target.value })} required /></FormField>
              <FormField label="用户名"><input value={regForm.username} onChange={e => setRegForm({ ...regForm, username: e.target.value })} required autoComplete="username" /></FormField>
              <FormField label="真实中文姓名" hint="将显示在你的个人主页和每条发言上"><input value={regForm.real_name} onChange={e => setRegForm({ ...regForm, real_name: e.target.value })} placeholder="例如：王小明" required /></FormField>
              <FormField label="届别" hint="高中毕业年份，例如 2028"><input inputMode="numeric" value={regForm.graduation_year} onChange={e => setRegForm({ ...regForm, graduation_year: e.target.value })} placeholder="例如：2028" required /></FormField>
              <FormField label="密码" hint="至少 10 位，含大小写字母、数字和符号"><input type="password" value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} required autoComplete="new-password" /></FormField>
              <div><Btn go type="submit">提交注册申请</Btn></div>
            </form>
          </main>
        )}

        {/* ======= notifications ======= */}
        {view.name === 'notifications' && (
          <main style={{ maxWidth: '48rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <Pair en="NOTIFICATIONS" zh="通知" />
                <Field>{notifications.filter(n => !n.is_read).length} 条未读 │ 共 {notifications.length} 条</Field>
              </div>
              {me && notifications.some(n => !n.is_read) && (
                <Btn small onClick={() => { void api.post('/notifications/read-all').then(loadNotifications); }}>全部标为已读</Btn>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="ef-empty" style={{ marginTop: '1.5rem' }}>暂无通知。有人回复你的话题、发布公告时会出现在这里。</p>
            ) : (
              <ul className="ef-records" style={{ marginTop: '1.5rem' }}>
                {notifications.map((n, i) => (
                  <li key={n.id} style={n.is_read ? { opacity: 0.55 } : undefined}>
                    <a className="ef-record" href="#" onClick={e => { e.preventDefault(); void api.post(`/notifications/${n.id}/read`).then(loadNotifications); }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      <span className="ef-field">{formatDate(n.created_at).slice(0, 10)}</span>
                      <span className="name" style={{ fontWeight: n.is_read ? 400 : 700 }}>
                        {n.title}
                        <span style={{ display: 'block', fontWeight: 400, fontSize: '0.85rem', color: 'var(--ef-ink-2)' }}>{n.body}</span>
                      </span>
                      <span>{n.is_read ? <span className="ef-field">已读</span> : <StateTag label="未读" alert />}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </main>
        )}

        {/* ======= admin / console ======= */}
        {view.name === 'admin' && isStaff && (
          <main>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <header className="ef-head" style={{ marginTop: '1.75rem' }}>
              <h1>管理后台 <small>MODERATION CONSOLE</small></h1>
              <p>监管由教师、AI Lab 与 Computerization 信息化社负责人共同负责。所有操作都会记入审计日志。</p>
            </header>

            <div className="ef-figs" style={{ marginBottom: '2rem', borderTop: 0 }}>
              <div><b>{pendingCount}</b><span>待激活用户</span></div>
              <div><b>{openReports}</b><span>待处理举报</span></div>
              <div><b>{unusedInvitations}</b><span>可用邀请码</span></div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {ADMIN_TABS.map(tab => (
                <button key={tab.key} type="button" className={`ef-chip${view.tab === tab.key ? ' is-active' : ''}`}
                  aria-pressed={view.tab === tab.key} onClick={() => goAdmin(tab.key)}>
                  {tab.zh}<span className="n">{tab.en}</span>
                </button>
              ))}
            </div>

            {view.tab === 'users' && (
              <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                <h2>用户管理 <small>{adminUsers.length} 个账号</small></h2>
                {adminUsers.length === 0 ? <p className="ef-empty">没有用户记录。</p> : (
                  <ul className="ef-rows">
                    {adminUsers.map(u => (
                      <li key={u.id}>
                        <div>
                          <strong>{u.real_name}</strong>{' '}
                          {u.status === 'pending' && <StateTag label="待激活" alert />}
                          {u.status === 'muted' && <StateTag label="禁言中" draft />}
                          {u.status === 'banned' && <StateTag label="已封禁" draft />}
                          <div className="meta">
                            <span>{u.username}</span>
                            <span>{u.graduation_year} 届</span>
                            <span>{ROLE_LABEL[u.role] ?? u.role}</span>
                            <span>注册于 {formatDate(u.created_at).slice(0, 10)}</span>
                          </div>
                        </div>
                        <div className="acts">
                          {u.status === 'pending' && isAdmin && <Btn small go onClick={() => void activateUser(u.id)}>激活</Btn>}
                          {u.status === 'active' && u.id !== me?.id && isAdmin && <Btn small onClick={() => void setUserStatus(u.id, 'muted')}>禁言</Btn>}
                          {u.status === 'active' && u.id !== me?.id && isAdmin && <Btn small danger onClick={() => void setUserStatus(u.id, 'banned')}>封禁</Btn>}
                          {(u.status === 'muted' || u.status === 'banned') && isAdmin && <Btn small onClick={() => void setUserStatus(u.id, 'active')}>恢复</Btn>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view.tab === 'reports' && (
              <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                <h2>举报队列 <small>{openReports} 条待处理</small></h2>
                {adminReports.length === 0 ? <p className="ef-empty">暂无举报。用户提交的举报会按时间顺序列在这里。</p> : (
                  <ul className="ef-rows">
                    {adminReports.map(r => (
                      <li key={r.id}>
                        <div>
                          <strong>{r.reason}</strong>{' '}
                          {r.status === 'open' && <StateTag label="待处理" alert />}
                          {r.status === 'in_review' && <StateTag label="处理中" draft />}
                          {r.status === 'resolved' && <StateTag label="已处理" />}
                          {r.status === 'rejected' && <StateTag label="已驳回" draft />}
                          <div className="meta">
                            <span>对象：{r.target_type === 'thread' ? '话题' : r.target_type === 'post' ? '回复' : '用户'}</span>
                            <span>举报人：{r.reporter_username ?? r.reporter_id.slice(0, 8)}</span>
                            <span>{formatDate(r.created_at)}</span>
                          </div>
                          {r.details && <div className="meta"><span>补充：{r.details}</span></div>}
                        </div>
                        <div className="acts">
                          {(r.status === 'open' || r.status === 'in_review') && (
                            <>
                              <Btn small go onClick={() => void resolveReport(r.id)}>处理</Btn>
                              <Btn small onClick={() => void rejectReport(r.id)}>驳回</Btn>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view.tab === 'invitations' && (
              <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                <h2>邀请码管理 <small>{unusedInvitations} 个可用</small></h2>
                {isAdmin && <div style={{ marginBottom: '1rem' }}><Btn small go onClick={() => void createInvitation()}>生成新邀请码（7 天有效）</Btn></div>}
                {adminInvitations.length === 0 ? <p className="ef-empty">还没有邀请码。点击上方按钮生成。</p> : (
                  <ul className="ef-rows">
                    {adminInvitations.map(inv => (
                      <li key={inv.id}>
                        <div>
                          <strong style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{inv.code}</strong>{' '}
                          {inv.used_by ? <StateTag label="已使用" /> : <StateTag label="可用" alert />}
                          <div className="meta">
                            <span>创建：{formatDate(inv.created_at)}</span>
                            <span>{inv.expires_at ? `过期：${formatDate(inv.expires_at)}` : '永久有效'}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view.tab === 'announcements' && (
              <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(26rem, 100%), 1fr))' }}>
                <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                  <h2>发布公告 <small>全站可见</small></h2>
                  {isAdmin ? (
                    <form className="ef-form" onSubmit={createAnnouncement} style={{ display: 'grid', gap: '1rem' }}>
                      <FormField label="标题"><input value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} required /></FormField>
                      <FormField label="内容"><textarea rows={5} value={announcementForm.content} onChange={e => setAnnouncementForm({ ...announcementForm, content: e.target.value })} required /></FormField>
                      <FormField label="级别">
                        <select value={announcementForm.level} onChange={e => setAnnouncementForm({ ...announcementForm, level: e.target.value })}>
                          <option value="normal">普通</option>
                          <option value="important">重要</option>
                          <option value="urgent">紧急</option>
                        </select>
                      </FormField>
                      <FormField label="结束时间" hint="可选；过期后自动隐藏"><input type="datetime-local" value={announcementForm.ends_at} onChange={e => setAnnouncementForm({ ...announcementForm, ends_at: e.target.value })} /></FormField>
                      <div><Btn go type="submit">发布公告</Btn></div>
                    </form>
                  ) : <Notice flag="权限">只有管理员可以发布公告。</Notice>}
                </section>

                {isAdmin && (
                  <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                    <h2>创建板块 <small>现有 {boards.length} 个</small></h2>
                    <form className="ef-form" onSubmit={createBoard} style={{ display: 'grid', gap: '1rem' }}>
                      <FormField label="名称"><input value={newBoardForm.name} onChange={e => setNewBoardForm({ ...newBoardForm, name: e.target.value })} required /></FormField>
                      <FormField label="标识" hint="小写字母和连字符，用于网址"><input value={newBoardForm.slug} onChange={e => setNewBoardForm({ ...newBoardForm, slug: e.target.value })} placeholder="例如：club-activities" required /></FormField>
                      <FormField label="描述"><input value={newBoardForm.description} onChange={e => setNewBoardForm({ ...newBoardForm, description: e.target.value })} required /></FormField>
                      <div><Btn go type="submit">创建板块</Btn></div>
                    </form>
                  </section>
                )}
              </div>
            )}
          </main>
        )}
      </div>

      <footer style={{ borderTop: '1px solid var(--ef-rule)', marginTop: '3rem', padding: '1.25rem clamp(1rem, 4vw, 3rem)' }}>
        <Field>WFLA WALL │ 世外墙 │ AI LAB × COMPUTERIZATION │ 实名社区 游客可读</Field>
      </footer>
    </>
  );
}
