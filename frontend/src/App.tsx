import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Announcement, Board, Post, Thread, User } from './types';

type View =
  | { name: 'home' }
  | { name: 'board'; board: Board }
  | { name: 'thread'; thread: Thread; posts: Post[] }
  | { name: 'login' };

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

function Button({ children, onClick, type = 'button', className = '' }: { children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'; className?: string }) {
  return (
    <button type={type} onClick={onClick} className={`ef-btn ${className}`}>
      <span>{children}</span>
    </button>
  );
}

function RecordRow({ index, title, meta, onClick }: { index: number; title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="ef-row w-full" onClick={onClick} style={{ textAlign: 'left', width: '100%', display: 'grid', gridTemplateColumns: '72px 1fr 180px', gap: '12px', alignItems: 'center', padding: '14px 12px', background: 'transparent', border: 0, borderTop: '1px solid var(--ef-rule)' }}>
      <span className="ef-field">No.{String(index).padStart(3, '0')}</span>
      <strong style={{ fontWeight: 700 }}>{title}</strong>
      <span className="ef-field">{meta}</span>
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reply, setReply] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const activeBoard = view.name === 'board' ? view.board : null;
  const activeThread = view.name === 'thread' ? view.thread : null;

  useEffect(() => {
    api.get<{ user: User }>('/me').then(data => setMe(data.user)).catch(() => setMe(null));
    api.get<{ items: Board[] }>('/boards').then(data => setBoards(data.items)).catch(() => setBoards([]));
    api.get<{ items: Announcement[] }>('/announcements').then(data => setAnnouncements(data.items)).catch(() => setAnnouncements([]));
  }, []);

  useEffect(() => {
    if (!activeBoard) return;
    api.get<{ items: Thread[] }>(`/boards/${activeBoard.slug}/threads?limit=50`).then(data => setThreads(data.items)).catch(e => setError(e.message));
  }, [activeBoard]);

  async function openThread(id: string) {
    try {
      const data = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${id}`);
      setPosts(data.posts);
      setView({ name: 'thread', thread: data.item, posts: data.posts });
      void api.post('/threads/' + id + '/view');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await api.post<{ user: User }>('/login', { username, password });
      setMe(data.user);
      setView({ name: 'home' });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logout() {
    await api.post('/logout').catch(() => undefined);
    setMe(null);
    setView({ name: 'home' });
  }

  async function createThread(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBoard) return;
    try {
      await api.post(`/boards/${activeBoard.slug}/threads`, { title: newTitle, content: newContent });
      const data = await api.get<{ items: Thread[] }>(`/boards/${activeBoard.slug}/threads?limit=50`);
      setThreads(data.items);
      setNewTitle('');
      setNewContent('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createReply(event: React.FormEvent) {
    event.preventDefault();
    if (!activeThread) return;
    try {
      await api.post(`/threads/${activeThread.id}/posts`, { content: reply });
      const data = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${activeThread.id}`);
      setPosts(data.posts);
      setReply('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const stats = useMemo(() => ({
    boards: boards.length,
    threads: threads.length,
    announcements: announcements.length
  }), [boards, threads, announcements]);

  return (
    <div className="ef-page">
      <div className="ef-sheet">
        <div className="ef-tri" aria-hidden="true" />
        <header className="ef-sheet-head">
          <h1 className="ef-read">世外墙</h1>
          <Field>WFLA WALL │ {me ? `${me.real_name} / ${me.graduation_year}` : '访客'}</Field>
        </header>

        <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--ef-rule)' }}>
          <Button onClick={() => setView({ name: 'home' })} className={view.name === 'home' ? 'is-active' : ''}>首页</Button>
          {boards.map(board => (
            <Button key={board.id} onClick={() => setView({ name: 'board', board })} className={activeBoard?.id === board.id ? 'is-active' : ''}>{board.name}</Button>
          ))}
          <span style={{ flex: 1 }} />
          {me ? <Button onClick={logout}>退出</Button> : <Button onClick={() => setView({ name: 'login' })}>登录</Button>}
        </nav>

        {error && <p className="ef-note">{error}</p>}

        {view.name === 'login' && (
          <section className="ef-section">
            <Pair en="LOGIN" zh="内部账号登录" />
            <form onSubmit={login} className="ef-form" style={{ display: 'grid', gap: '12px', maxWidth: '420px' }}>
              <label className="ef-label">用户名<input className="ef-input" value={username} onChange={e => setUsername(e.target.value)} /></label>
              <label className="ef-label">密码<input className="ef-input" type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
              <Button type="submit">登录</Button>
              <p className="ef-field">内测账号由管理员分发。后续将切换为邀请注册和第三方登录。</p>
            </form>
          </section>
        )}

        {view.name === 'home' && (
          <>
            <section className="ef-section">
              <Pair en="ANNOUNCEMENTS" zh="公告" />
              {announcements.length === 0 ? <p className="ef-empty">还没有公告。学校、教师和社团发布后会出现在这里。</p> : (
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
              {boards.length === 0 ? <p className="ef-empty">还没有板块。管理员创建后，讨论会按板块列在这里。</p> : (
                <ul className="ef-ledger">
                  <li><span>板块数量</span><Field>{stats.boards}</Field></li>
                  {boards.map(board => <li key={board.id}><span>{board.name}</span><Field>{board.description}</Field></li>)}
                </ul>
              )}
            </section>
          </>
        )}

        {view.name === 'board' && activeBoard && (
          <section className="ef-section">
            <Pair en={activeBoard.slug.toUpperCase()} zh={activeBoard.name} />
            <Field>{activeBoard.description} │ {threads.length} 个话题</Field>
            {threads.length === 0 ? <p className="ef-empty">还没有话题。发起讨论后，它会按最新活动排在这里。</p> : threads.map((thread, index) => (
              <RecordRow
                key={thread.id}
                index={index + 1}
                title={thread.title}
                meta={`${thread.author?.real_name ?? '未知'} / ${thread.author?.graduation_year ?? '--'} │ ${thread.reply_count} 回复 │ ${formatDate(thread.last_activity_at)}`}
                onClick={() => void openThread(thread.id)}
              />
            ))}
            {me && (
              <form onSubmit={createThread} style={{ display: 'grid', gap: '12px', maxWidth: '720px', paddingTop: '24px' }}>
                <label className="ef-label">标题<input className="ef-input" value={newTitle} onChange={e => setNewTitle(e.target.value)} /></label>
                <label className="ef-label">正文<textarea className="ef-input" rows={6} value={newContent} onChange={e => setNewContent(e.target.value)} /></label>
                <Button type="submit">发起话题</Button>
              </form>
            )}
          </section>
        )}

        {view.name === 'thread' && activeThread && (
          <section className="ef-section">
            <Pair en={`THREAD / ${activeThread.id.slice(0, 8).toUpperCase()}`} zh={activeThread.title} />
            <Field>{activeThread.author?.real_name} / {activeThread.author?.graduation_year} │ {activeThread.reply_count} 回复 │ {activeThread.view_count} 次浏览</Field>
            <div style={{ marginTop: '16px' }}>
              {posts.map(post => (
                <article key={post.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '16px 0' }}>
                  <Field>No.{post.floor_number} │ {post.author?.real_name} / {post.author?.graduation_year} │ {formatDate(post.created_at)}</Field>
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
      </div>
    </div>
  );
}
