/**
 * X skin — a three-column information-feed layout, modelled on X (Twitter).
 *
 * This is the default main UI. It is pure presentation: every piece of state,
 * network call and permission check lives in `App.tsx` and arrives through the
 * `forum` prop (see ../contract.ts). Keep it that way: a skin that fetches its
 * own data cannot be swapped out.
 */
import type { ReactNode } from 'react';
import type { AdminTab, SkinContext } from '../contract';
import './x.css';

const ROLE_BADGE: Record<string, string> = {
  owner: '负责人',
  admin: '管理员',
  moderator: '监管者'
};

function initials(name: string | undefined): string {
  const value = (name ?? '').trim();
  if (!value) return '?';
  return value.length <= 2 ? value : value.slice(-2);
}

function Avatar({ name, small = false }: { name: string | undefined; small?: boolean }) {
  return <span className={small ? 'xsk-avatar sm' : 'xsk-avatar'} aria-hidden="true">{initials(name)}</span>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><b>{value}</b><span>{label}</span></div>;
}

export default function XSkin({ forum }: { forum: SkinContext }) {
  const { site, session, data, forms, messages, actions, view, setView, helpers, ui } = forum;
  const { me, providers, isStaff, isAdmin, isOwner } = session;

  const activeBoard = view.name === 'board' ? view.board : null;
  const activeThread = view.name === 'thread' ? view.thread : null;
  const bookmarkedIds = new Set(data.bookmarks.map(item => item.id));

  function navigate(next: typeof view) {
    setView(next);
    messages.setError('');
    messages.setSuccess('');
  }

  function goAdmin(tab: AdminTab) {
    navigate({ name: 'admin', tab });
  }

  function linkHandler(next: typeof view) {
    return (event: React.MouseEvent) => {
      event.preventDefault();
      navigate(next);
    };
  }

  function openNotifications(event: React.MouseEvent) {
    event.preventDefault();
    void actions.loadNotifications();
    navigate({ name: 'notifications' });
  }
  /* ------------------------------------------------------------- page body */

  function renderFeedThread(thread: typeof data.feed[number]): ReactNode {
    return <article key={thread.id} className="xsk-card flat xsk-feed-item">
      <Avatar name={thread.author?.real_name} />
      <div>
        <div className="xsk-card-head">
          <span className="name">{thread.author?.real_name ?? 'WFLAer'}</span>
          <span className="meta">{thread.author?.graduation_year ?? '—'} 届 · {helpers.formatDate(thread.created_at)}</span>
          {thread.board && <span className="xsk-board-label">{thread.board.name}</span>}
        </div>
        <button type="button" className="xsk-feed-open" onClick={() => void actions.openThread(thread.id)}>
          <h3 className="xsk-card-title">{thread.is_pinned && <span className="badge">置顶</span>}{thread.title}</h3>
          {thread.preview_html && <div className="xsk-prose xsk-preview" dangerouslySetInnerHTML={{ __html: thread.preview_html }} />}
        </button>
        <div className="xsk-card-foot xsk-feed-actions">
          <button type="button" onClick={() => void actions.openThread(thread.id)}>{thread.reply_count} 回复</button>
          <button type="button" onClick={() => void actions.likeThread(thread.id)}>赞</button>
          <button type="button" onClick={() => void actions.toggleBookmark(thread.id, bookmarkedIds.has(thread.id))}>{bookmarkedIds.has(thread.id) ? '已收藏' : '收藏'}</button>
        </div>
      </div>
    </article>;
  }

  function renderHome(): ReactNode {
    return (
      <>
        <div className="xsk-hero xsk-feed-hero"><span>THE CONVERSATION</span><h1>校园动态<span>.</span></h1><p>校园里的每一种声音</p></div>
        {me?.status === 'active' && data.boards.length > 0 ? <form className="xsk-home-compose" onSubmit={actions.createThread}>
          <Avatar name={me.real_name} />
          <div className="xsk-home-compose-body">
            <strong>你的声音，值得被听见。</strong>
            <select aria-label="选择社区空间" value={forms.composeBoard} onChange={event => forms.setComposeBoard(event.target.value)} required>
              <option value="">选择社区空间</option>{data.boards.map(board => <option key={board.id} value={board.slug}>{board.name}</option>)}
            </select>
            <input aria-label="话题标题" placeholder="话题标题" value={forms.newTitle} onChange={event => forms.setNewTitle(event.target.value)} required />
            <textarea aria-label="动态内容" placeholder="写下你想分享的事…" rows={3} value={forms.newContent} onChange={event => forms.setNewContent(event.target.value)} required />
            <div className="xsk-row"><small>实名发言 · {me.real_name}</small><button className="xsk-btn accent" type="submit">发布动态</button></div>
          </div>
        </form> : <div className="xsk-compose-gate">{!me ? '登录后即可发布动态。' : data.boards.length === 0 ? '社区空间建立后即可发布动态。' : '当前账号暂不能发布。'}{!me && <button type="button" onClick={() => navigate({ name: 'login' })}>去登录 →</button>}</div>}
        {data.feed.length ? data.feed.map(renderFeedThread) : <div className="xsk-feed-empty"><div className="xsk-feed-illustration" aria-hidden="true">✎</div><span>WFLA COMMUNITY</span><h2>第一条动态，等你开启。</h2><p>真实的校园故事，从这里开始。</p></div>}
        {data.feedCursor && <div className="xsk-load-more"><button type="button" disabled={data.feedBusy} onClick={() => void actions.loadMoreFeed()}>{data.feedBusy ? '加载中…' : '加载更多'}</button></div>}
      </>
    );
  }

  function renderAnnouncements(): ReactNode {
    return <section className="xsk-section"><h2>校园公告</h2>{data.announcements.length ? data.announcements.map(announcement =>
      <article key={announcement.id} className="xsk-card flat"><Avatar name={announcement.author_real_name} /><div><div className="xsk-card-head"><span className="name">{announcement.author_real_name}</span><span className="meta">{helpers.formatDate(announcement.starts_at)}</span></div><h3 className="xsk-card-title">{announcement.title}</h3><div className="xsk-prose" dangerouslySetInnerHTML={{ __html: announcement.content_html }} /></div></article>
    ) : <p className="xsk-empty">暂无校园公告。</p>}</section>;
  }

  function renderBookmarks(): ReactNode {
    return <section className="xsk-section"><h2>书签</h2>{!me ? <p className="xsk-empty">登录后查看收藏。</p> : data.bookmarks.length ? data.bookmarks.map(renderFeedThread) : <p className="xsk-empty">还没有收藏的话题。</p>}</section>;
  }

  function renderSearch(): ReactNode {
    const results = data.searchResults;
    return <section className="xsk-section"><h2>搜索结果 · {forms.searchQuery}</h2>{results && <><h3>话题</h3>{results.threads.length ? results.threads.map(renderFeedThread) : <p className="xsk-empty">没有匹配的话题</p>}<h3>回复</h3>{results.posts.length ? results.posts.map(post => <button key={post.id} type="button" className="xsk-search-hit" onClick={() => void actions.openThread(post.thread_id)}>{post.thread_title} · 查看回复 →</button>) : <p className="xsk-empty">没有匹配的回复</p>}<h3>成员</h3>{results.users.length ? results.users.map(user => <p key={user.id} className="xsk-search-hit">{user.real_name} · {user.graduation_year} 届</p>) : <p className="xsk-empty">没有匹配的成员</p>}</>}</section>;
  }

  function renderBoard(): ReactNode {
    return (
      <>
        <div className="xsk-topbar">
          <button type="button" className="xsk-btn ghost small" onClick={() => navigate({ name: 'home' })}>← 返回</button>
          <div>
            <h1>{activeBoard!.name}</h1>
            <span className="sub">{activeBoard!.description}</span>
          </div>
        </div>

        {data.threads.length === 0 ? (
          <p className="xsk-empty">这个板块还没有话题。</p>
        ) : (
          data.threads.map(thread => (
            <button key={thread.id} type="button" className="xsk-card" onClick={() => void actions.openThread(thread.id)}>
              <Avatar name={thread.author?.real_name} />
              <div>
                <div className="xsk-card-head">
                  <span className="name">{thread.author?.real_name ?? '未知'}</span>
                  <span className="meta">{thread.author?.graduation_year ?? '--'} 届 · {helpers.formatDate(thread.last_activity_at)}</span>
                  {thread.is_pinned && <span className="badge">置顶</span>}
                </div>
                <h3 className="xsk-card-title">{thread.title}</h3>
                <div className="xsk-card-foot">
                  <span>{thread.reply_count} 回复</span>
                  <span>{thread.view_count} 浏览</span>
                </div>
              </div>
            </button>
          ))
        )}

        <section className="xsk-section">
          {me ? (
            <form className="xsk-form" onSubmit={actions.createThread}>
              <h2>发起话题</h2>
              <label className="xsk-field">
                <span>标题</span>
                <input value={forms.newTitle} onChange={event => forms.setNewTitle(event.target.value)} required />
              </label>
              <label className="xsk-field">
                <span>正文</span>
                <textarea rows={5} value={forms.newContent} onChange={event => forms.setNewContent(event.target.value)} required />
              </label>
              <div className="xsk-row"><button type="submit" className="xsk-btn accent">发布话题</button></div>
            </form>
          ) : (
            <p className="xsk-notice">游客可以浏览，登录后才能在「{activeBoard!.name}」发起话题。</p>
          )}
        </section>
      </>
    );
  }

  function renderThread(): ReactNode {
    return (
      <>
        <div className="xsk-topbar">
          <button type="button" className="xsk-btn ghost small" onClick={() => navigate({ name: 'home' })}>← 返回</button>
          <div>
            <h1>{activeThread!.title}</h1>
            <span className="sub">
              {activeThread!.author?.real_name} · {activeThread!.author?.graduation_year} 届 · {activeThread!.reply_count} 回复 · {activeThread!.view_count} 浏览
            </span>
          </div>
        </div>

        {me && (
          <div className="xsk-section">
            <button type="button" className="xsk-btn ghost small" onClick={() => void actions.submitReport('thread', activeThread!.id)}>举报话题</button>
          </div>
        )}

        {data.posts.map(post => (
          <article key={post.id} className="xsk-card flat">
            <Avatar name={post.author?.real_name} />
            <div>
              <div className="xsk-card-head">
                <span className="name">{post.author?.real_name ?? '未知'}</span>
                <span className="meta">{post.author?.graduation_year ?? '--'} 届 · #{post.floor_number} · {helpers.formatDate(post.created_at)}</span>
                {post.author && ROLE_BADGE[post.author.role] && <span className="badge">{ROLE_BADGE[post.author.role]}</span>}
              </div>
              <div className="xsk-prose" dangerouslySetInnerHTML={{ __html: post.content_html }} />
              {me && post.author_id !== me.id && (
                <div className="xsk-card-foot">
                  <button type="button" className="xsk-btn ghost small" onClick={() => void actions.submitReport('post', post.id)}>举报</button>
                </div>
              )}
            </div>
          </article>
        ))}

        <section className="xsk-section">
          {me ? (
            <form className="xsk-form" onSubmit={actions.createReply}>
              <h2>写下回复</h2>
              <label className="xsk-field">
                <span>内容</span>
                <textarea rows={4} value={forms.reply} onChange={event => forms.setReply(event.target.value)} required />
              </label>
              <div className="xsk-row"><button type="submit" className="xsk-btn accent">发送回复</button></div>
            </form>
          ) : (
            <p className="xsk-notice">登录后可以参与这个讨论。</p>
          )}
        </section>
      </>
    );
  }
  function renderLogin(): ReactNode {
    return (
      <section className="xsk-section" style={{ maxWidth: '26rem' }}>
        <h2>登录</h2>
        <form className="xsk-form" onSubmit={actions.login}>
          <label className="xsk-field">
            <span>用户名</span>
            <input value={forms.username} onChange={event => forms.setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label className="xsk-field">
            <span>密码</span>
            <input type="password" value={forms.password} onChange={event => forms.setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <div className="xsk-row"><button type="submit" className="xsk-btn accent">登录</button></div>
        </form>
        {(providers.microsoft || providers.github) && (
          <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.4rem' }}>
            <span className="xsk-field"><span>第三方登录（需先绑定论坛账号）</span></span>
            {providers.microsoft && <a href={`${site.api_origin}/api/v1/auth/microsoft/login`}>使用 Microsoft 账号登录</a>}
            {providers.github && <a href={`${site.api_origin}/api/v1/auth/github/login`}>使用 GitHub 账号登录</a>}
          </div>
        )}
      </section>
    );
  }

  function renderRegister(): ReactNode {
    if (!site.registration_enabled) {
      return <p className="xsk-empty">当前未开放注册，请联系管理组。</p>;
    }
    return (
      <section className="xsk-section" style={{ maxWidth: '28rem' }}>
        <h2>邀请注册</h2>
        <p className="xsk-notice">注册采用邀请制，提交后需管理员手动激活。</p>
        <form className="xsk-form" onSubmit={actions.register}>
          <label className="xsk-field">
            <span>邀请码</span>
            <small>向管理组（AI Lab / Computerization）索取</small>
            <input value={forms.regForm.invitation_code} onChange={event => forms.setRegForm(previous => ({ ...previous, invitation_code: event.target.value }))} required />
          </label>
          <label className="xsk-field">
            <span>用户名</span>
            <input value={forms.regForm.username} onChange={event => forms.setRegForm(previous => ({ ...previous, username: event.target.value }))} autoComplete="username" required />
          </label>
          <label className="xsk-field">
            <span>真实中文姓名</span>
            <small>将显示在你的个人主页和每条发言上</small>
            <input value={forms.regForm.real_name} onChange={event => forms.setRegForm(previous => ({ ...previous, real_name: event.target.value }))} required />
          </label>
          <label className="xsk-field">
            <span>届别</span>
            <small>高中毕业年份，例如 2028</small>
            <input inputMode="numeric" value={forms.regForm.graduation_year} onChange={event => forms.setRegForm(previous => ({ ...previous, graduation_year: event.target.value }))} required />
          </label>
          <label className="xsk-field">
            <span>密码</span>
            <small>至少 10 位，含大小写字母、数字和符号</small>
            <input type="password" value={forms.regForm.password} onChange={event => forms.setRegForm(previous => ({ ...previous, password: event.target.value }))} autoComplete="new-password" required />
          </label>
          <div className="xsk-row"><button type="submit" className="xsk-btn accent">提交注册申请</button></div>
        </form>
      </section>
    );
  }

  /* ------------------------------------------------------------- settings */

  const SKIN_SYNC_LABEL: Record<string, string> = {
    idle: '尚未同步到账号',
    saving: '正在同步…',
    saved: '已同步到账号',
    guest: '游客 · 仅保存在本浏览器',
    error: '同步失败 · 已保存在本浏览器'
  };

  /**
   * User-facing settings. Currently the layout (skin) picker, which is the one
   * personal preference the forum has; it is deliberately reachable by every
   * member from the rail, not only by admins.
   */
  function renderSettings(): ReactNode {
    const status = site.skin_preference_status;
    const preview = [
      { id: 'x', hint: '三段式信息流：左导航 / 中信息流 / 右栏公告与板块。' },
      { id: 'endfield', hint: '档案式布局：几何切割、等宽数字、跑马灯公告。' }
    ].filter(item => site.skins.some(skin => skin.id === item.id));

    return (
      <>
        <div className="xsk-topbar">
          <div>
            <h1>设置</h1>
            <span className="sub">个人偏好只作用于你自己的账号和浏览器。</span>
          </div>
        </div>

        <section className="xsk-panel">
          <h2>界面皮肤</h2>
          <p className="xsk-notice" style={{ marginTop: 0 }}>
            皮肤切换的是<b>整套布局</b>，不只是颜色。切换后立即生效。
            {site.skin_sync_available
              ? ' 你已登录，选择会同步到账号，换设备登录后自动沿用。'
              : ' 当前是游客模式，选择只保存在本浏览器；登录后可同步到账号。'}
          </p>
          <div className="xsk-skin-grid">
            {preview.map(item => {
              const skin = site.skins.find(candidate => candidate.id === item.id)!;
              const active = item.id === site.active_skin;
              return (
                <button key={item.id} type="button" className={active ? 'xsk-skin-card active' : 'xsk-skin-card'}
                  aria-pressed={active}
                  onClick={() => site.setSkin(item.id)}>
                  <span className="thumb" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                  <span className="body">
                    <span className="name">{skin.name}{active && <span className="badge">当前</span>}</span>
                    <span className="desc">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="xsk-field-desc">
            同步状态：{SKIN_SYNC_LABEL[status] ?? status}
            {site.skin_sync_available && status === 'error' && '（可再点一次皮肤重试）'}
          </p>
        </section>

        <section className="xsk-panel">
          <h2>账号</h2>
          {me ? (
            <div className="xsk-row" style={{ alignItems: 'baseline' }}>
              <span><b>{me.real_name}</b> · {me.graduation_year} 届</span>
              <span className="xsk-tag">{ui.roleLabel[me.role] ?? me.role}</span>
              <span className="xsk-field-desc" style={{ marginLeft: 'auto' }}>
                论坛不作匿名发帖，个人主页公开真实姓名与届别。
              </span>
            </div>
          ) : (
            <p className="xsk-field-desc">你还未登录。登录后可在此查看账号信息与同步偏好。</p>
          )}
        </section>
      </>
    );
  }

  function renderNotifications(): ReactNode {
    const unread = data.notifications.filter(item => !item.is_read).length;
    return (
      <>
        <div className="xsk-topbar">
          <div>
            <h1>通知</h1>
            <span className="sub">{unread} 条未读 · 共 {data.notifications.length} 条</span>
          </div>
          <div className="xsk-row" style={{ marginLeft: 'auto' }}>
            <button type="button" className="xsk-btn ghost small" onClick={() => void actions.loadNotifications()}>刷新</button>
            {unread > 0 && <button type="button" className="xsk-btn small" onClick={() => void actions.markAllNotificationsRead()}>全部已读</button>}
          </div>
        </div>
        {data.notifications.length === 0 ? (
          <p className="xsk-empty">暂无通知。</p>
        ) : (
          data.notifications.map(item => (
            <button key={item.id} type="button" className="xsk-card" style={item.is_read ? { opacity: 0.6 } : undefined}
              onClick={() => void actions.markNotificationRead(item.id)}>
              <Avatar name={item.title} small />
              <div>
                <div className="xsk-card-head">
                  <span className="name">{item.title}</span>
                  <span className="meta">{helpers.formatDate(item.created_at)}</span>
                  {!item.is_read && <span className="badge">未读</span>}
                </div>
                <p className="xsk-card-body">{item.body}</p>
              </div>
            </button>
          ))
        )}
      </>
    );
  }
  /* ---------------------------------------------------------------- admin */

  function renderAdminUsers(): ReactNode {
    return (
      <section className="xsk-panel">
        <h2>用户管理 · {data.adminUsers.length} 个账号</h2>
        {data.adminUsers.length === 0 ? <p className="xsk-empty">没有用户记录。</p> : (
          <ul className="xsk-rows">
            {data.adminUsers.map(user => (
              <li key={user.id}>
                <div>
                  <strong>{user.real_name}</strong>{' '}
                  {user.status === 'pending' && <span className="xsk-tag warn">待激活</span>}
                  {user.status === 'muted' && <span className="xsk-tag">禁言中</span>}
                  {user.status === 'banned' && <span className="xsk-tag alarm">已封禁</span>}
                  <div className="meta">
                    <span>{user.username}</span>
                    <span>{user.graduation_year} 届</span>
                    <span>{ui.roleLabel[user.role] ?? user.role}</span>
                  </div>
                </div>
                <div className="xsk-row">
                  {user.status === 'pending' && isAdmin && (
                    <button type="button" className="xsk-btn accent small" onClick={() => void actions.activateUser(user.id)}>激活</button>
                  )}
                  {user.status === 'active' && user.id !== me?.id && isAdmin && (
                    <button type="button" className="xsk-btn ghost small" onClick={() => void actions.setUserStatus(user.id, 'muted')}>禁言</button>
                  )}
                  {user.status === 'active' && user.id !== me?.id && isAdmin && (
                    <button type="button" className="xsk-btn danger small" onClick={() => void actions.setUserStatus(user.id, 'banned')}>封禁</button>
                  )}
                  {(user.status === 'muted' || user.status === 'banned') && isAdmin && (
                    <button type="button" className="xsk-btn ghost small" onClick={() => void actions.setUserStatus(user.id, 'active')}>恢复</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function renderAdminReports(): ReactNode {
    return (
      <section className="xsk-panel">
        <h2>举报队列 · {data.openReports} 条待处理</h2>
        {data.adminReports.length === 0 ? <p className="xsk-empty">暂无举报。</p> : (
          <ul className="xsk-rows">
            {data.adminReports.map(report => (
              <li key={report.id}>
                <div>
                  <strong>{report.reason}</strong>{' '}
                  <span className="xsk-tag">{report.status}</span>
                  <div className="meta">
                    <span>对象：{report.target_type === 'thread' ? '话题' : report.target_type === 'post' ? '回复' : '用户'}</span>
                    <span>举报人：{report.reporter_username ?? report.reporter_id.slice(0, 8)}</span>
                    <span>{helpers.formatDate(report.created_at)}</span>
                  </div>
                  {report.details && <p className="xsk-card-body">{report.details}</p>}
                </div>
                <div className="xsk-row">
                  {(report.status === 'open' || report.status === 'in_review') && (
                    <>
                      <button type="button" className="xsk-btn accent small" onClick={() => void actions.resolveReport(report.id)}>处理</button>
                      <button type="button" className="xsk-btn ghost small" onClick={() => void actions.rejectReport(report.id)}>驳回</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function renderAdminInvitations(): ReactNode {
    return (
      <section className="xsk-panel">
        <h2>邀请码 · {data.unusedInvitations} 个可用</h2>
        {isAdmin && (
          <div className="xsk-row" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="xsk-btn accent small" onClick={() => void actions.createInvitation()}>生成邀请码（7 天有效）</button>
          </div>
        )}
        {data.adminInvitations.length === 0 ? <p className="xsk-empty">还没有邀请码。</p> : (
          <ul className="xsk-rows">
            {data.adminInvitations.map(invitation => (
              <li key={invitation.id}>
                <code>{invitation.code}</code>
                <div className="meta">
                  <span>{invitation.used_by ? '已使用' : '未使用'}</span>
                  <span>{invitation.expires_at ? `到期 ${helpers.formatDate(invitation.expires_at)}` : '永久有效'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function renderAdminAnnouncements(): ReactNode {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <section className="xsk-panel">
          <h2>发布全站公告</h2>
          {isAdmin ? (
            <form className="xsk-form" onSubmit={actions.createAnnouncement}>
              <label className="xsk-field">
                <span>标题</span>
                <input value={forms.announcementForm.title} onChange={event => forms.setAnnouncementForm(previous => ({ ...previous, title: event.target.value }))} required />
              </label>
              <label className="xsk-field">
                <span>内容</span>
                <textarea rows={5} value={forms.announcementForm.content} onChange={event => forms.setAnnouncementForm(previous => ({ ...previous, content: event.target.value }))} required />
              </label>
              <label className="xsk-field">
                <span>级别</span>
                <select value={forms.announcementForm.level} onChange={event => forms.setAnnouncementForm(previous => ({ ...previous, level: event.target.value }))}>
                  <option value="normal">普通</option>
                  <option value="important">重要</option>
                  <option value="urgent">紧急</option>
                </select>
              </label>
              <label className="xsk-field">
                <span>结束时间</span>
                <small>可选；过期后自动隐藏</small>
                <input type="datetime-local" value={forms.announcementForm.ends_at} onChange={event => forms.setAnnouncementForm(previous => ({ ...previous, ends_at: event.target.value }))} />
              </label>
              <div className="xsk-row"><button type="submit" className="xsk-btn accent">发布公告</button></div>
            </form>
          ) : <p className="xsk-notice">只有管理员可以发布公告。</p>}
        </section>

        {isAdmin && (
          <section className="xsk-panel">
            <h2>创建板块</h2>
            <form className="xsk-form" onSubmit={actions.createBoard}>
              <label className="xsk-field">
                <span>名称</span>
                <input value={forms.newBoardForm.name} onChange={event => forms.setNewBoardForm(previous => ({ ...previous, name: event.target.value }))} required />
              </label>
              <label className="xsk-field">
                <span>标识</span>
                <small>小写字母和连字符，用于网址</small>
                <input value={forms.newBoardForm.slug} onChange={event => forms.setNewBoardForm(previous => ({ ...previous, slug: event.target.value }))} required />
              </label>
              <label className="xsk-field">
                <span>描述</span>
                <input value={forms.newBoardForm.description} onChange={event => forms.setNewBoardForm(previous => ({ ...previous, description: event.target.value }))} required />
              </label>
              <div className="xsk-row"><button type="submit" className="xsk-btn accent">创建板块</button></div>
            </form>
          </section>
        )}
      </div>
    );
  }
  function renderAdminAppearance(): ReactNode {
    if (!isOwner) return <p className="xsk-notice">只有论坛所有者可以修改站点外观。</p>;
    const config = forms.siteConfig;
    if (!config) return <p className="xsk-empty">正在加载站点配置…</p>;
    return (
      <section className="xsk-panel">
        <h2>站点外观与可见性</h2>
        <p className="xsk-notice">皮肤是完整的界面布局，不只是配色。默认皮肤对所有未保存过个人选择的访客生效。</p>
        <form className="xsk-form" onSubmit={actions.saveSiteConfig}>
          <label className="xsk-field">
            <span>默认皮肤</span>
            <select
              value={config.default_skin}
              onChange={event => forms.setSiteConfig(previous => previous ? { ...previous, default_skin: event.target.value } : previous)}
            >
              {config.skins.map(skin => <option key={skin.id} value={skin.id}>{skin.name}</option>)}
            </select>
          </label>
          <div className="xsk-field">
            <span>允许使用的皮肤</span>
            {config.all_skins.map(skin => (
              <label key={skin.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={config.skins.some(allowed => allowed.id === skin.id)}
                  onChange={event => forms.setSiteConfig(previous => {
                    if (!previous) return previous;
                    const ids = previous.skins.map(item => item.id);
                    const nextIds = event.target.checked
                      ? [...ids, skin.id]
                      : ids.filter(id => id !== skin.id);
                    const allowed = previous.all_skins.filter(item => nextIds.includes(item.id));
                    if (allowed.length === 0) return previous;
                    const defaultSkin = allowed.some(item => item.id === previous.default_skin)
                      ? previous.default_skin
                      : allowed[0]!.id;
                    return { ...previous, skins: allowed, default_skin: defaultSkin };
                  })}
                />
                <span>{skin.name}<small> — {skin.description}</small></span>
              </label>
            ))}
          </div>
          <label className="xsk-field">
            <span>站点标语</span>
            <input value={config.tagline} onChange={event => forms.setSiteConfig(previous => previous ? { ...previous, tagline: event.target.value } : previous)} />
          </label>
          <label className="xsk-field" style={{ flexDirection: 'row', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={config.guest_read_enabled} onChange={event => forms.setSiteConfig(previous => previous ? { ...previous, guest_read_enabled: event.target.checked } : previous)} />
            <span>允许游客浏览公开内容</span>
          </label>
          <label className="xsk-field" style={{ flexDirection: 'row', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={config.registration_enabled} onChange={event => forms.setSiteConfig(previous => previous ? { ...previous, registration_enabled: event.target.checked } : previous)} />
            <span>开放邀请注册</span>
          </label>
          <div className="xsk-row"><button type="submit" className="xsk-btn accent">保存站点设置</button></div>
        </form>
      </section>
    );
  }

  function renderAdminSettings(): ReactNode {
    if (!isOwner) return <p className="xsk-notice">只有论坛所有者可以修改高级设置。</p>;
    if (!forms.settings) return <p className="xsk-empty">正在加载运行时配置…</p>;
    return (
      <section className="xsk-panel">
        <h2>高级设置</h2>
        <form className="xsk-form" onSubmit={actions.saveSettings}>
          <h3>站点</h3>
          <label className="xsk-field">
            <span>论坛名称</span>
            <input value={forms.settingsForm.forum_name} onChange={event => forms.setSettingsForm(previous => ({ ...previous, forum_name: event.target.value }))} required />
          </label>
          <label className="xsk-field">
            <span>站点公开地址</span>
            <small>用于 CORS 和 Cookie，例如 https://wflawall.zh.kg</small>
            <input value={forms.settingsForm.public_origin} onChange={event => forms.setSettingsForm(previous => ({ ...previous, public_origin: event.target.value }))} required />
          </label>
          <label className="xsk-field">
            <span>会话有效时间（秒）</span>
            <input type="number" min={300} max={2592000} value={forms.settingsForm.session_ttl_seconds} onChange={event => forms.setSettingsForm(previous => ({ ...previous, session_ttl_seconds: Number(event.target.value) }))} required />
          </label>
          <label className="xsk-field">
            <span>Cookie SameSite</span>
            <select value={forms.settingsForm.cookie_samesite} onChange={event => forms.setSettingsForm(previous => ({ ...previous, cookie_samesite: event.target.value as 'Lax' | 'Strict' }))}>
              <option value="Lax">Lax（推荐）</option>
              <option value="Strict">Strict</option>
            </select>
          </label>
          <label className="xsk-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={forms.settingsForm.cookie_secure} onChange={event => forms.setSettingsForm(previous => ({ ...previous, cookie_secure: event.target.checked }))} />
            <span>Cookie 仅通过 HTTPS 发送</span>
          </label>
          <label className="xsk-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={forms.settingsForm.trust_proxy_headers} onChange={event => forms.setSettingsForm(previous => ({ ...previous, trust_proxy_headers: event.target.checked }))} />
            <span>信任反向代理的 X-Forwarded-For</span>
          </label>

          <h3>GitHub OAuth</h3>
          <label className="xsk-field">
            <span>Client ID</span>
            <input value={forms.settingsForm.github_client_id} onChange={event => forms.setSettingsForm(previous => ({ ...previous, github_client_id: event.target.value }))} />
          </label>
          <label className="xsk-field">
            <span>回调地址</span>
            <input value={forms.settingsForm.github_redirect_uri} onChange={event => forms.setSettingsForm(previous => ({ ...previous, github_redirect_uri: event.target.value }))} placeholder="https://wflawall.zh.kg/api/v1/auth/github/callback" />
          </label>
          <label className="xsk-field">
            <span>Client Secret{forms.settings.github_client_secret_configured ? '（已配置，留空保留）' : ''}</span>
            <input type="password" autoComplete="new-password" value={forms.settingsForm.github_client_secret} onChange={event => forms.setSettingsForm(previous => ({ ...previous, github_client_secret: event.target.value }))} />
          </label>

          <h3>Microsoft OAuth</h3>
          <label className="xsk-field">
            <span>Application (client) ID</span>
            <input value={forms.settingsForm.microsoft_client_id} onChange={event => forms.setSettingsForm(previous => ({ ...previous, microsoft_client_id: event.target.value }))} />
          </label>
          <label className="xsk-field">
            <span>回调地址</span>
            <input value={forms.settingsForm.microsoft_redirect_uri} onChange={event => forms.setSettingsForm(previous => ({ ...previous, microsoft_redirect_uri: event.target.value }))} placeholder="https://wflawall.zh.kg/api/v1/auth/microsoft/callback" />
          </label>
          <label className="xsk-field">
            <span>Client Secret{forms.settings.microsoft_client_secret_configured ? '（已配置，留空保留）' : ''}</span>
            <input type="password" autoComplete="new-password" value={forms.settingsForm.microsoft_client_secret} onChange={event => forms.setSettingsForm(previous => ({ ...previous, microsoft_client_secret: event.target.value }))} />
          </label>

          <h3>第三方登录连通性</h3>
          <div className="xsk-row">
            <button type="button" className="xsk-btn ghost small" onClick={() => void actions.runDiagnostics()} disabled={forms.diagnosticsBusy}>
              {forms.diagnosticsBusy ? '检测中…' : '运行连通性检测'}
            </button>
          </div>
          {forms.diagnostics && (
            <ul className="xsk-rows">
              {Object.entries(forms.diagnostics.results).map(([key, result]) => (
                <li key={key}>
                  <span>{result.label}</span>
                  <span className="meta">{result.ok ? `正常 · ${result.status} · ${result.latency_ms}ms` : `不通 · ${result.error ?? '未知错误'}`}</span>
                </li>
              ))}
            </ul>
          )}
          {forms.diagnostics?.hint && <p className="xsk-notice">{forms.diagnostics.hint}</p>}

          <label className="xsk-field">
            <span>当前管理员密码</span>
            <small>用于确认这次敏感配置修改</small>
            <input type="password" autoComplete="current-password" value={forms.settingsForm.confirm_password} onChange={event => forms.setSettingsForm(previous => ({ ...previous, confirm_password: event.target.value }))} required />
          </label>
          <div className="xsk-row">
            <button type="submit" className="xsk-btn accent">保存高级设置</button>
            <button type="button" className="xsk-btn ghost" onClick={actions.resetSettingsPassword}>清空敏感字段</button>
          </div>
        </form>
      </section>
    );
  }
  function renderAdmin(): ReactNode {
    const tabs = ui.adminTabs.filter(tab => (tab.key === 'settings' || tab.key === 'appearance') ? isOwner : true);
    return (
      <div className="xsk-admin">
        <div className="xsk-topbar" style={{ position: 'static', padding: '0 0 1rem' }}>
          <div>
            <h1>管理后台</h1>
            <span className="sub">监管由教师、AI Lab 与 Computerization 信息化社负责人共同负责。所有操作都会记入审计日志。</span>
          </div>
        </div>

        <div className="xsk-stats">
          <Stat value={data.pendingCount} label="待激活用户" />
          <Stat value={data.openReports} label="待处理举报" />
          <Stat value={data.unusedInvitations} label="可用邀请码" />
        </div>

        <div className="xsk-tabs">
          {tabs.map(tab => (
            <button key={tab.key} type="button" className="xsk-tab" aria-pressed={view.name === 'admin' && view.tab === tab.key}
              onClick={() => goAdmin(tab.key)}>
              {tab.zh}
            </button>
          ))}
        </div>

        {view.name === 'admin' && view.tab === 'users' && renderAdminUsers()}
        {view.name === 'admin' && view.tab === 'reports' && renderAdminReports()}
        {view.name === 'admin' && view.tab === 'invitations' && renderAdminInvitations()}
        {view.name === 'admin' && view.tab === 'announcements' && renderAdminAnnouncements()}
        {view.name === 'admin' && view.tab === 'settings' && renderAdminSettings()}
        {view.name === 'admin' && view.tab === 'appearance' && renderAdminAppearance()}
      </div>
    );
  }

  function renderBody(): ReactNode {
    if (view.name === 'home') return renderHome();
    if (view.name === 'announcements') return renderAnnouncements();
    if (view.name === 'bookmarks') return renderBookmarks();
    if (view.name === 'search') return renderSearch();
    if (view.name === 'board' && activeBoard) return renderBoard();
    if (view.name === 'thread' && activeThread) return renderThread();
    if (view.name === 'login') return renderLogin();
    if (view.name === 'register') return renderRegister();
    if (view.name === 'notifications') return renderNotifications();
    if (view.name === 'settings') return renderSettings();
    if (view.name === 'admin' && isStaff) return renderAdmin();
    return <p className="xsk-empty">页面不存在。</p>;
  }

  const title = view.name === 'home' ? '校园动态'
    : view.name === 'announcements' ? '校园公告'
    : view.name === 'bookmarks' ? '书签'
    : view.name === 'search' ? '搜索结果'
    : view.name === 'board' ? activeBoard?.name ?? '板块'
    : view.name === 'thread' ? activeThread?.title ?? '话题'
    : view.name === 'login' ? '登录'
    : view.name === 'register' ? '注册'
    : view.name === 'notifications' ? '通知'
    : view.name === 'settings' ? '设置'
    : '管理后台';
  return (
    <div className="xsk">
      <div className="xsk-layout">
        <aside className="xsk-rail">
          <a href="#" className="xsk-logo" onClick={linkHandler({ name: 'home' })}>
            <img src="/wfla-logo-transparent.png" alt="" />
            <span className="text railhide">WFLA <small>校园社区</small></span>
          </a>
          <span className="xsk-rail-label railhide">发现校园</span>
          <nav>
            <a href="#" className="xsk-navitem" aria-current={view.name === 'home' ? 'page' : undefined} onClick={linkHandler({ name: 'home' })}>
              <span className="glyph">⌂</span><span className="label">首页</span>
            </a>
            <a href="#" className="xsk-navitem" aria-current={view.name === 'search' ? 'page' : undefined} onClick={linkHandler({ name: 'search' })}><span className="glyph">⌕</span><span className="label">探索</span></a>
            {me && <a href="#" className="xsk-navitem" aria-current={view.name === 'bookmarks' ? 'page' : undefined} onClick={event => { event.preventDefault(); void actions.loadBookmarks(); navigate({ name: 'bookmarks' }); }}><span className="glyph">♧</span><span className="label">书签</span></a>}
            <span className="xsk-rail-label railhide">社区空间</span>
            <a href="#" className="xsk-navitem" aria-current={view.name === 'announcements' ? 'page' : undefined} onClick={linkHandler({ name: 'announcements' })}><span className="glyph">♧</span><span className="label railhide">校园公告</span></a>
            {data.boards.map(board => (
              <a key={board.id} href="#" className="xsk-navitem" aria-current={activeBoard?.id === board.id ? 'page' : undefined}
                onClick={linkHandler({ name: 'board', board })}>
                <span className="glyph">#</span><span className="label railhide">{board.name}</span>
              </a>
            ))}
            {me && (
              <a href="#" className="xsk-navitem" aria-current={view.name === 'notifications' ? 'page' : undefined} onClick={openNotifications}>
                <span className="glyph">◔</span><span className="label">通知</span>
                {data.notifications.some(item => !item.is_read) && <span className="n">{data.notifications.filter(item => !item.is_read).length}</span>}
              </a>
            )}
            <a href="#" className="xsk-navitem" aria-current={view.name === 'settings' ? 'page' : undefined} onClick={linkHandler({ name: 'settings' })}>
              <span className="glyph">☰</span><span className="label railhide">设置</span>
            </a>
            {isStaff && (
              <a href="#" className="xsk-navitem" aria-current={view.name === 'admin' ? 'page' : undefined} onClick={linkHandler({ name: 'admin', tab: 'users' })}>
                <span className="glyph">⚙</span><span className="label">管理</span>
              </a>
            )}
          </nav>

          {me ? (
            <button type="button" className="xsk-post-btn" onClick={() => navigate({ name: 'home' })}>发帖</button>
          ) : (
            <button type="button" className="xsk-post-btn" onClick={() => navigate({ name: 'register' })}>注册</button>
          )}

          <div className="xsk-railfoot railhide">
            {me ? (
              <div style={{ background: 'var(--x-panel)', borderRadius: '16px', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                <div className="xsk-card-head">
                  <Avatar name={me.real_name} small />
                  <div>
                    <div className="name">{me.real_name}</div>
                    <div className="meta">{me.graduation_year} 届 · {ui.roleLabel[me.role] ?? me.role}</div>
                  </div>
                </div>
                <div className="xsk-row">
                  <button type="button" className="xsk-btn ghost small" onClick={() => navigate({ name: 'settings' })}>设置</button>
                  <button type="button" className="xsk-btn ghost small" onClick={() => void actions.logout()}>退出</button>
                  {providers.github && (
                    <button type="button" className="xsk-btn ghost small" onClick={() => { window.location.href = `${site.api_origin}/api/v1/auth/github/link?return_to=/`; }}>绑定 GitHub</button>
                  )}
                  {providers.microsoft && (
                    <button type="button" className="xsk-btn ghost small" onClick={() => { window.location.href = `${site.api_origin}/api/v1/auth/microsoft/link?return_to=/`; }}>绑定 Microsoft</button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="xsk-notice">访客模式 · 可浏览公开内容</p>
                <div className="xsk-row">
                  <button type="button" className="xsk-btn ghost small" onClick={() => navigate({ name: 'login' })}>登录</button>
                  {site.registration_enabled && <button type="button" className="xsk-btn small" onClick={() => navigate({ name: 'register' })}>注册</button>}
                </div>
              </>
            )}
          </div>
        </aside>

        <main className="xsk-main">
          <div className="xsk-topbar">
            <h1>{title}</h1>
            <form className="xsk-top-search" onSubmit={event => { event.preventDefault(); void actions.searchForum(forms.searchQuery); }} role="search">
              <input aria-label="搜索校园内容" placeholder="搜索校园内容" value={forms.searchQuery} onChange={event => forms.setSearchQuery(event.target.value)} />
            </form>
          </div>
          {messages.error && <div className="xsk-flash error">{messages.error}</div>}
          {messages.success && <div className="xsk-flash success">{messages.success}</div>}
          {renderBody()}
        </main>
        <aside className="xsk-side">
          {data.announcements.length > 0 && (
            <div className="panel">
              <h3>最新公告</h3>
              <ul>
                {data.announcements.slice(0, 5).map(announcement => (
                  <li key={announcement.id}>
                    <a href={`#${data.announcementAnchorId}`} onClick={event => { event.preventDefault(); navigate({ name: 'home' }); }}>
                      <span className="t">{announcement.title}</span>
                      <span className="d">{helpers.formatDate(announcement.starts_at)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="panel">
            <h3>板块</h3>
            <ul>
              {data.boards.map(board => (
                <li key={board.id}>
                  <a href="#" onClick={linkHandler({ name: 'board', board })}>
                    <span className="t">{board.name}</span>
                    <span className="d">{board.description}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <h3>界面皮肤</h3>
            <p className="xsk-field-desc" style={{ marginTop: 0 }}>
              当前：<b>{site.skins.find(skin => skin.id === site.active_skin)?.name ?? site.active_skin}</b>
            </p>
            {/* The canonical, per-user switch lives in Settings so every member
                can reach it; this is only a shortcut for signed-in members. */}
            <button type="button" className="xsk-btn ghost small" onClick={() => navigate({ name: 'settings' })}>
              在设置中切换
            </button>
          </div>
          <div className="panel">
            <h3>版本</h3>
            <p className="d">{site.forum_name} · v{site.version} · {site.skins.length} 款皮肤</p>
          </div>
        </aside>
      </div>

      <nav className="xsk-mobilebar">
        <button type="button" aria-current={view.name === 'home' ? 'page' : undefined} onClick={() => navigate({ name: 'home' })}>首页</button>
        <button type="button" aria-current={view.name === 'search' ? 'page' : undefined} onClick={() => navigate({ name: 'search' })}>探索</button>
        {me && <button type="button" aria-current={view.name === 'notifications' ? 'page' : undefined} onClick={openNotifications}>通知</button>}
        {me && <button type="button" aria-current={view.name === 'bookmarks' ? 'page' : undefined} onClick={() => { void actions.loadBookmarks(); navigate({ name: 'bookmarks' }); }}>书签</button>}
        <button type="button" aria-current={view.name === 'announcements' ? 'page' : undefined} onClick={() => navigate({ name: 'announcements' })}>公告</button>
        <button type="button" aria-current={view.name === 'settings' ? 'page' : undefined} onClick={() => navigate({ name: 'settings' })}>设置</button>
        {isStaff && <button type="button" aria-current={view.name === 'admin' ? 'page' : undefined} onClick={() => goAdmin('users')}>管理</button>}
        {!me && <button type="button" onClick={() => navigate({ name: 'login' })}>登录</button>}
      </nav>
    </div>
  );
}
