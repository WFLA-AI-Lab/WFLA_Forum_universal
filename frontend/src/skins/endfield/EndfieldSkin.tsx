/**
 * Endfield skin — the original WFLA Wall interface.
 *
 * Pure presentation: it receives one `SkinContext` and renders it. All state,
 * fetching and auth live in `App.tsx` (see ../../skins/contract.ts). Do not add
 * data fetching here; add a field to the contract instead.
 */
import type { SkinContext } from '../contract';
import { EndfieldPrimitives } from './primitives';
import './endfield.css';
// Picks the Endfield layout variant from the URL / saved attributes before the
// skin paints. It is Endfield-specific, so it lives here rather than in index.html.
import './variant.js';

export default function EndfieldSkin({ forum }: { forum: SkinContext }) {
  const { site, session, data, forms, messages, actions, view, setView, helpers, ui } = forum;
  const { Field, Pair, Btn, FormField, StateTag, Notice } = EndfieldPrimitives;
  const activeBoard = view.name === 'board' ? view.board : null;
  const activeThread = view.name === 'thread' ? view.thread : null;

  function go(name: 'home' | 'login' | 'register' | 'notifications') {
    return (event: React.MouseEvent) => {
      event.preventDefault();
      if (name === 'notifications') void actions.loadNotifications();
      setView({ name });
      messages.clearMessages();
    };
  }

  function goAdmin(tab: (typeof ui.adminTabs)[number]['key']) {
    setView({ name: 'admin', tab });
    messages.setError('');
    messages.setSuccess('');
  }


  return (
    <>
      <header className="ef-cmdbar">
        <button type="button" className="brand" onClick={() => { setView({ name: 'home' }); messages.setError(''); messages.setSuccess(''); }}
          style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
          <span className="seal">世</span>
          {site.forum_name}
        </button>
        <nav>
          <a href="#" aria-current={view.name === 'home' ? 'page' : undefined} onClick={go('home')}>
            <small>HOME</small>首页
          </a>
          {data.boards.map(b => (
            <a key={b.id} href="#" aria-current={activeBoard?.id === b.id ? 'page' : undefined}
              onClick={e => { e.preventDefault(); setView({ name: 'board', board: b }); messages.setError(''); messages.setSuccess(''); }}>
              <small>{b.slug.toUpperCase()}</small>{b.name}
            </a>
          ))}
          {session.me && (
            <a href="#" aria-current={view.name === 'notifications' ? 'page' : undefined} onClick={go('notifications')}>
              <small>NOTICES</small>通知
            </a>
          )}
          {session.isStaff && (
            <a href="#" aria-current={view.name === 'admin' ? 'page' : undefined}
              onClick={e => { e.preventDefault(); goAdmin('users'); }}>
              <small>CONSOLE</small>管理
            </a>
          )}
        </nav>
        <div className="util">
          {session.me ? (
            <>
              <span>{session.me.real_name} │ {session.me.graduation_year} 届 │ {ui.roleLabel[session.me.role] ?? session.me.role}</span>
              {session.providers.microsoft && (
                <Btn small onClick={() => { window.location.href = `${site.api_origin}/api/v1/auth/microsoft/link?return_to=/`; }}>绑定 Microsoft</Btn>
              )}
              {session.providers.github && (
                <Btn small onClick={() => { window.location.href = `${site.api_origin}/api/v1/auth/github/link?return_to=/`; }}>绑定 GitHub</Btn>
              )}
              <Btn small onClick={actions.logout}>退出</Btn>
            </>
          ) : (
            <>
              <span>访客模式 │ 可浏览公开内容</span>
              <Btn small onClick={() => { setView({ name: 'login' }); messages.setError(''); messages.setSuccess(''); }}>登录</Btn>
              <Btn small go onClick={() => { setView({ name: 'register' }); messages.setError(''); messages.setSuccess(''); }}>注册</Btn>
            </>
          )}
        </div>
      </header>

      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 3rem) 4rem' }}>
        {messages.error && <div style={{ marginTop: '1rem' }}><Notice flag="出错">{messages.error}</Notice></div>}
        {messages.success && <div style={{ marginTop: '1rem' }}><Notice flag="完成">{messages.success}</Notice></div>}

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
                {String(data.boards.length).padStart(2, '0')}
              </span>
            </div>

            <div className="ef-facts" style={{ marginBottom: '2.5rem' }}>
              <Field>{data.boards.length} 个板块</Field>
              <Field>{data.announcements.length} 条公告</Field>
              <Field>{session.me ? `当前：${session.me.real_name} / ${session.me.graduation_year} 届` : '当前：访客'}</Field>
            </div>

            {data.announcements.length > 0 && (
              <div className="ef-ticker" style={{ marginBottom: '3rem' }} aria-label="最新公告">
                <div className="track">
                  <ul>
                    {data.announcements.map(a => (
                      <li key={a.id}><a href="#data.announcements" onClick={e => e.preventDefault()}><b>公告</b>{a.title}<span style={{ opacity: 0.65, fontSize: '0.8em' }}>{helpers.formatDate(a.starts_at)}</span></a></li>
                    ))}
                  </ul>
                  <ul aria-hidden="true">
                    {data.announcements.map(a => (
                      <li key={`${a.id}-dup`}><a href="#data.announcements" onClick={e => e.preventDefault()} tabIndex={-1}><b>公告</b>{a.title}<span style={{ opacity: 0.65, fontSize: '0.8em' }}>{helpers.formatDate(a.starts_at)}</span></a></li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <h2 className="ef-bar-title">板块</h2>
            {data.boards.length === 0 ? (
              <p className="ef-empty">板块正在准备中，开放后会列在这里。</p>
            ) : (
              <ul className="ef-records" style={{ marginBottom: '3rem' }}>
                {data.boards.map((b, i) => (
                  <li key={b.id}>
                    <a className="ef-record" href="#" onClick={e => { e.preventDefault(); setView({ name: 'board', board: b }); messages.setError(''); messages.setSuccess(''); }}>
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

            <h2 className="ef-bar-title" id="data.announcements">公告</h2>
            {data.announcements.length === 0 ? (
              <p className="ef-empty">还没有公告。版本维护、全站规则等重要通知会显示在这里。</p>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
                {data.announcements.map((a, i) => (
                  <article key={a.id} className="ef-panel cut-br" style={{ padding: '1.4rem 1.5rem', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      {a.level !== 'normal'
                        ? <StateTag label={ui.levelLabel[a.level] ?? a.level} alert />
                        : <span className="ef-tag">{ui.levelLabel[a.level] ?? a.level}</span>}
                      <Field>{helpers.formatDate(a.starts_at)}{a.ends_at ? ` │ 截止 ${helpers.formatDate(a.ends_at)}` : ''}</Field>
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
              <Field>{activeBoard.description} │ {data.threads.length} 个话题 │ {data.totalReplies} 条回复</Field>
            </div>

            {data.threads.length === 0 ? (
              <p className="ef-empty" style={{ marginTop: '1.5rem' }}>这个板块还没有话题。{session.me ? '发布第一个话题，从下面的表单开始。' : '登录后可以发布第一个话题。'}</p>
            ) : (
              <ul className="ef-records" style={{ marginTop: '1.5rem' }}>
                {data.threads.map((t, i) => (
                  <li key={t.id}>
                    <a className="ef-record" href="#" onClick={e => { e.preventDefault(); void actions.openThread(t.id); }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      <span className="ef-field">{helpers.formatDate(t.last_activity_at).slice(5, 10)}</span>
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
              {session.me ? (
                <form className="ef-form" onSubmit={actions.createThread} style={{ display: 'grid', gap: '1rem' }}>
                  <Pair en="NEW THREAD" zh="发起话题" />
                  <FormField label="标题"><input value={forms.newTitle} onChange={e => forms.setNewTitle(e.target.value)} required /></FormField>
                  <FormField label="正文"><textarea rows={6} value={forms.newContent} onChange={e => forms.setNewContent(e.target.value)} required /></FormField>
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
                {activeThread.author?.real_name} / {activeThread.author?.graduation_year} 届 │ {activeThread.reply_count} 回复 │ {activeThread.view_count} 次浏览 │ 最后活动 {helpers.formatDate(activeThread.last_activity_at)}
              </Field>
              {session.me && (
                <div style={{ marginTop: '0.75rem' }}>
                  <Btn small onClick={() => void actions.submitReport('thread', activeThread.id)}>举报话题</Btn>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              {data.posts.map(post => (
                <article key={post.id} style={{ borderTop: '1px solid var(--ef-rule)', padding: '1.25rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <Field>
                      No.{String(post.floor_number).padStart(3, '0')} │ {post.author?.real_name} / {post.author?.graduation_year} 届
                      {post.author && ['owner', 'admin', 'moderator'].includes(post.author.role) && ` │ ${ui.roleLabel[post.author.role]}`}
                      {' │ '}{helpers.formatDate(post.created_at)}
                    </Field>
                    {session.me && post.author_id !== session.me.id && <Btn small onClick={() => void actions.submitReport('post', post.id)}>举报</Btn>}
                  </div>
                  <div className="ef-prose" dangerouslySetInnerHTML={{ __html: post.content_html }} />
                </article>
              ))}
            </div>

            <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--ef-ink)' }}>
              {session.me ? (
                <form className="ef-form" onSubmit={actions.createReply} style={{ display: 'grid', gap: '1rem' }}>
                  <Pair en="REPLY" zh="写下回复" />
                  <FormField label="内容"><textarea rows={4} value={forms.reply} onChange={e => forms.setReply(e.target.value)} required /></FormField>
                  <div><Btn go type="submit">发送回复</Btn></div>
                </form>
              ) : (
                <Notice flag="提示">登录后可以参与这个讨论。</Notice>
              )}
            </div>
          </main>
        )}

        {/* ======= actions.login ======= */}
        {view.name === 'login' && (
          <main style={{ maxWidth: '26rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem' }}>
              <Pair en="SIGN IN" zh="登录" />
            </div>
            <form className="ef-form" onSubmit={actions.login} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              <FormField label="用户名"><input value={forms.username} onChange={e => forms.setUsername(e.target.value)} required autoComplete="username" /></FormField>
              <FormField label="密码"><input type="password" value={forms.password} onChange={e => forms.setPassword(e.target.value)} required autoComplete="current-password" /></FormField>
              <div><Btn go type="submit">登录</Btn></div>
            </form>
            {(session.providers.microsoft || session.providers.github) && (
              <div className="ef-field" style={{ marginTop: '1.5rem', display: 'grid', gap: '0.5rem' }}>
                <span>第三方登录（需先绑定论坛账号）：</span>
                {session.providers.microsoft && (
                  <a href={`${site.api_origin}/api/v1/auth/microsoft/login`}>使用 Microsoft 账号登录</a>
                )}
                {session.providers.github && (
                  <a href={`${site.api_origin}/api/v1/auth/github/login`}>使用 GitHub 账号登录</a>
                )}
              </div>
            )}
          </main>
        )}

        {/* ======= actions.register ======= */}
        {view.name === 'register' && (
          <main style={{ maxWidth: '26rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem' }}>
              <Pair en="REGISTER" zh="邀请注册" />
              <Field>注册采用邀请制 │ 提交后需管理员手动激活</Field>
            </div>
            <form className="ef-form" onSubmit={actions.register} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              <FormField label="邀请码" hint="向管理组（AI Lab / Computerization）索取"><input value={forms.regForm.invitation_code} onChange={e => forms.setRegForm({ ...forms.regForm, invitation_code: e.target.value })} required /></FormField>
              <FormField label="用户名"><input value={forms.regForm.username} onChange={e => forms.setRegForm({ ...forms.regForm, username: e.target.value })} required autoComplete="username" /></FormField>
              <FormField label="真实中文姓名" hint="将显示在你的个人主页和每条发言上"><input value={forms.regForm.real_name} onChange={e => forms.setRegForm({ ...forms.regForm, real_name: e.target.value })} placeholder="例如：王小明" required /></FormField>
              <FormField label="届别" hint="高中毕业年份，例如 2028"><input inputMode="numeric" value={forms.regForm.graduation_year} onChange={e => forms.setRegForm({ ...forms.regForm, graduation_year: e.target.value })} placeholder="例如：2028" required /></FormField>
              <FormField label="密码" hint="至少 10 位，含大小写字母、数字和符号"><input type="password" value={forms.regForm.password} onChange={e => forms.setRegForm({ ...forms.regForm, password: e.target.value })} required autoComplete="new-password" /></FormField>
              <div><Btn go type="submit">提交注册申请</Btn></div>
            </form>
          </main>
        )}

        {/* ======= data.notifications ======= */}
        {view.name === 'notifications' && (
          <main style={{ maxWidth: '48rem' }}>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <div style={{ padding: '1.75rem 0 0.5rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <Pair en="NOTIFICATIONS" zh="通知" />
                <Field>{data.notifications.filter(n => !n.is_read).length} 条未读 │ 共 {data.notifications.length} 条</Field>
              </div>
              {session.me && data.notifications.some(n => !n.is_read) && (
                <Btn small onClick={() => { void actions.markAllNotificationsRead(); }}>全部标为已读</Btn>
              )}
            </div>
            {data.notifications.length === 0 ? (
              <p className="ef-empty" style={{ marginTop: '1.5rem' }}>暂无通知。有人回复你的话题、发布公告时会出现在这里。</p>
            ) : (
              <ul className="ef-records" style={{ marginTop: '1.5rem' }}>
                {data.notifications.map((n, i) => (
                  <li key={n.id} style={n.is_read ? { opacity: 0.55 } : undefined}>
                    <a className="ef-record" href="#" onClick={e => { e.preventDefault(); void actions.markNotificationRead(n.id); }}>
                      <span className="ef-field">No.{String(i + 1).padStart(3, '0')}</span>
                      <span className="ef-field">{helpers.formatDate(n.created_at).slice(0, 10)}</span>
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
        {view.name === 'admin' && session.isStaff && (
          <main>
            <div className="ef-tri" aria-hidden="true" style={{ marginTop: '1.5rem' }} />
            <header className="ef-head" style={{ marginTop: '1.75rem' }}>
              <h1>管理后台 <small>MODERATION CONSOLE</small></h1>
              <p>监管由教师、AI Lab 与 Computerization 信息化社负责人共同负责。所有操作都会记入审计日志。</p>
            </header>

            <div className="ef-figs" style={{ marginBottom: '2rem', borderTop: 0 }}>
              <div><b>{data.pendingCount}</b><span>待激活用户</span></div>
              <div><b>{data.openReports}</b><span>待处理举报</span></div>
              <div><b>{data.unusedInvitations}</b><span>可用邀请码</span></div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {ui.adminTabs.filter(tab => tab.key !== 'settings' || session.isOwner).map(tab => (
                <button key={tab.key} type="button" className={`ef-chip${view.tab === tab.key ? ' is-active' : ''}`}
                  aria-pressed={view.tab === tab.key} onClick={() => goAdmin(tab.key)}>
                  {tab.zh}<span className="n">{tab.en}</span>
                </button>
              ))}
            </div>

            {view.tab === 'users' && (
              <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                <h2>用户管理 <small>{data.adminUsers.length} 个账号</small></h2>
                {data.adminUsers.length === 0 ? <p className="ef-empty">没有用户记录。</p> : (
                  <ul className="ef-rows">
                    {data.adminUsers.map(u => (
                      <li key={u.id}>
                        <div>
                          <strong>{u.real_name}</strong>{' '}
                          {u.status === 'pending' && <StateTag label="待激活" alert />}
                          {u.status === 'muted' && <StateTag label="禁言中" draft />}
                          {u.status === 'banned' && <StateTag label="已封禁" draft />}
                          <div className="meta">
                            <span>{u.username}</span>
                            <span>{u.graduation_year} 届</span>
                            <span>{ui.roleLabel[u.role] ?? u.role}</span>
                            <span>注册于 {helpers.formatDate(u.created_at).slice(0, 10)}</span>
                          </div>
                        </div>
                        <div className="acts">
                          {u.status === 'pending' && session.isAdmin && <Btn small go onClick={() => void actions.activateUser(u.id)}>激活</Btn>}
                          {u.status === 'active' && u.id !== session.me?.id && session.isAdmin && <Btn small onClick={() => void actions.setUserStatus(u.id, 'muted')}>禁言</Btn>}
                          {u.status === 'active' && u.id !== session.me?.id && session.isAdmin && <Btn small danger onClick={() => void actions.setUserStatus(u.id, 'banned')}>封禁</Btn>}
                          {(u.status === 'muted' || u.status === 'banned') && session.isAdmin && <Btn small onClick={() => void actions.setUserStatus(u.id, 'active')}>恢复</Btn>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view.tab === 'reports' && (
              <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                <h2>举报队列 <small>{data.openReports} 条待处理</small></h2>
                {data.adminReports.length === 0 ? <p className="ef-empty">暂无举报。用户提交的举报会按时间顺序列在这里。</p> : (
                  <ul className="ef-rows">
                    {data.adminReports.map(r => (
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
                            <span>{helpers.formatDate(r.created_at)}</span>
                          </div>
                          {r.details && <div className="meta"><span>补充：{r.details}</span></div>}
                        </div>
                        <div className="acts">
                          {(r.status === 'open' || r.status === 'in_review') && (
                            <>
                              <Btn small go onClick={() => void actions.resolveReport(r.id)}>处理</Btn>
                              <Btn small onClick={() => void actions.rejectReport(r.id)}>驳回</Btn>
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
                <h2>邀请码管理 <small>{data.unusedInvitations} 个可用</small></h2>
                {session.isAdmin && <div style={{ marginBottom: '1rem' }}><Btn small go onClick={() => void actions.createInvitation()}>生成新邀请码（7 天有效）</Btn></div>}
                {data.adminInvitations.length === 0 ? <p className="ef-empty">还没有邀请码。点击上方按钮生成。</p> : (
                  <ul className="ef-rows">
                    {data.adminInvitations.map(inv => (
                      <li key={inv.id}>
                        <div>
                          <strong style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{inv.code}</strong>{' '}
                          {inv.used_by ? <StateTag label="已使用" /> : <StateTag label="可用" alert />}
                          <div className="meta">
                            <span>创建：{helpers.formatDate(inv.created_at)}</span>
                            <span>{inv.expires_at ? `过期：${helpers.formatDate(inv.expires_at)}` : '永久有效'}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view.tab === 'settings' && (
              <section className="ef-panel" style={{ padding: '1.25rem 1.5rem' }}>
                <h2>高级设置 <small>仅负责人可修改 · 保存后立即生效</small></h2>
                {!session.isOwner ? <Notice flag="权限">只有论坛所有者可以修改高级设置。</Notice> : !forms.settings ? (
                  <p className="ef-empty">正在加载运行时配置…</p>
                ) : (
                  <form className="ef-form" onSubmit={actions.saveSettings} style={{ display: 'grid', gap: '1.25rem' }}>
                    <div>
                      <h3>站点</h3>
                      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(18rem, 100%), 1fr))' }}>
                        <FormField label="论坛名称"><input value={forms.settingsForm.forum_name} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, forum_name: e.target.value })} required /></FormField>
                        <FormField label="站点公开地址" hint="用于 CORS 和 Cookie，例如 https://wflawall.zh.kg"><input value={forms.settingsForm.public_origin} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, public_origin: e.target.value })} required /></FormField>
                        <FormField label="会话有效时间（秒）" hint="300 到 2592000"><input type="number" min={300} max={2592000} value={forms.settingsForm.session_ttl_seconds} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, session_ttl_seconds: Number(e.target.value) })} required /></FormField>
                        <FormField label="Cookie SameSite"><select value={forms.settingsForm.cookie_samesite} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, cookie_samesite: e.target.value as 'Lax' | 'Strict' })}><option value="Lax">Lax（推荐）</option><option value="Strict">Strict</option></select></FormField>
                        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={forms.settingsForm.cookie_secure} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, cookie_secure: e.target.checked })} /><span>Cookie 仅通过 HTTPS 发送</span></label>
                        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={forms.settingsForm.trust_proxy_headers} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, trust_proxy_headers: e.target.checked })} /><span>信任反向代理的 X-Forwarded-For</span></label>
                      </div>
                    </div>

                    <div>
                      <h3>GitHub OAuth</h3>
                      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(18rem, 100%), 1fr))' }}>
                        <FormField label="Client ID"><input value={forms.settingsForm.github_client_id} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, github_client_id: e.target.value })} /></FormField>
                        <FormField label="回调地址" hint="必须与 GitHub OAuth App 完全一致"><input value={forms.settingsForm.github_redirect_uri} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, github_redirect_uri: e.target.value })} placeholder="https://wflawall.zh.kg/api/v1/auth/github/callback" /></FormField>
                        <FormField label={`Client Secret${forms.settings.github_client_secret_configured ? '（已配置，留空保留）' : ''}`}><input type="password" autoComplete="new-password" value={forms.settingsForm.github_client_secret} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, github_client_secret: e.target.value })} /></FormField>
                        {forms.settings.github_client_secret_configured && <label className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={forms.settingsForm.clear_github_client_secret} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, clear_github_client_secret: e.target.checked })} /><span>清除已保存的 GitHub Secret</span></label>}
                      </div>
                    </div>

                    <div>
                      <h3>Microsoft OAuth</h3>
                      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(18rem, 100%), 1fr))' }}>
                        <FormField label="Application (client) ID"><input value={forms.settingsForm.microsoft_client_id} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, microsoft_client_id: e.target.value })} /></FormField>
                        <FormField label="回调地址" hint="必须与 Entra 应用注册的重定向 URI 完全一致"><input value={forms.settingsForm.microsoft_redirect_uri} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, microsoft_redirect_uri: e.target.value })} placeholder="https://wflawall.zh.kg/api/v1/auth/microsoft/callback" /></FormField>
                        <FormField label={`Client Secret${forms.settings.microsoft_client_secret_configured ? '（已配置，留空保留）' : ''}`}><input type="password" autoComplete="new-password" value={forms.settingsForm.microsoft_client_secret} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, microsoft_client_secret: e.target.value })} /></FormField>
                        {forms.settings.microsoft_client_secret_configured && <label className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={forms.settingsForm.clear_microsoft_client_secret} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, clear_microsoft_client_secret: e.target.checked })} /><span>清除已保存的 Microsoft Secret</span></label>}
                      </div>
                    </div>

                    <div>
                      <h3>第三方登录连通性</h3>
                      <p style={{ margin: '0.25rem 0 0.75rem', color: 'var(--ef-ink-2)' }}>
                        检查服务器能否访问 GitHub 与 Microsoft 的登录接口。配置修改后建议先运行一次。
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <Btn small onClick={() => void actions.runDiagnostics()} disabled={forms.diagnosticsBusy}>
                          {forms.diagnosticsBusy ? '检测中…' : '运行连通性检测'}
                        </Btn>
                      </div>
                      {forms.diagnostics && (
                        <>
                          <ul className="ef-ledger">
                            {Object.entries(forms.diagnostics.results).map(([key, result]) => (
                              <li key={key}>
                                <span>{result.label}</span>
                                <span>
                                  {result.ok
                                    ? `正常 · ${result.status} · ${result.latency_ms}ms`
                                    : `不通 · ${result.error ?? '未知错误'}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {forms.diagnostics.hint
                            ? <Notice flag="网络">{forms.diagnostics.hint}</Notice>
                            : <Notice flag="正常">第三方登录接口当前全部可达。</Notice>}
                        </>
                      )}
                    </div>

                    <Notice flag="安全">Secret 会使用 AUTH_SESSION_SECRET 派生的 AES-GCM 密钥加密保存，不会回显。保存前需要验证当前账号密码。</Notice>
                    <FormField label="当前管理员密码" hint="用于确认这次敏感配置修改"><input type="password" autoComplete="current-password" value={forms.settingsForm.confirm_password} onChange={e => forms.setSettingsForm({ ...forms.settingsForm, confirm_password: e.target.value })} required /></FormField>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Btn go type="submit">保存高级设置</Btn>
                      <Btn onClick={actions.resetSettingsPassword}>清空敏感字段</Btn>
                    </div>
                  </form>
                )}
              </section>
            )}
            {view.tab === 'announcements' && (
              <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(26rem, 100%), 1fr))' }}>
                <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                  <h2>发布公告 <small>全站可见</small></h2>
                  {session.isAdmin ? (
                    <form className="ef-form" onSubmit={actions.createAnnouncement} style={{ display: 'grid', gap: '1rem' }}>
                      <FormField label="标题"><input value={forms.announcementForm.title} onChange={e => forms.setAnnouncementForm({ ...forms.announcementForm, title: e.target.value })} required /></FormField>
                      <FormField label="内容"><textarea rows={5} value={forms.announcementForm.content} onChange={e => forms.setAnnouncementForm({ ...forms.announcementForm, content: e.target.value })} required /></FormField>
                      <FormField label="级别">
                        <select value={forms.announcementForm.level} onChange={e => forms.setAnnouncementForm({ ...forms.announcementForm, level: e.target.value })}>
                          <option value="normal">普通</option>
                          <option value="important">重要</option>
                          <option value="urgent">紧急</option>
                        </select>
                      </FormField>
                      <FormField label="结束时间" hint="可选；过期后自动隐藏"><input type="datetime-local" value={forms.announcementForm.ends_at} onChange={e => forms.setAnnouncementForm({ ...forms.announcementForm, ends_at: e.target.value })} /></FormField>
                      <div><Btn go type="submit">发布公告</Btn></div>
                    </form>
                  ) : <Notice flag="权限">只有管理员可以发布公告。</Notice>}
                </section>

                {session.isAdmin && (
                  <section className="ef-panel" style={{ padding: '1.25rem 1.5rem', position: 'relative' }}>
                    <h2>创建板块 <small>现有 {data.boards.length} 个</small></h2>
                    <form className="ef-form" onSubmit={actions.createBoard} style={{ display: 'grid', gap: '1rem' }}>
                      <FormField label="名称"><input value={forms.newBoardForm.name} onChange={e => forms.setNewBoardForm({ ...forms.newBoardForm, name: e.target.value })} required /></FormField>
                      <FormField label="标识" hint="小写字母和连字符，用于网址"><input value={forms.newBoardForm.slug} onChange={e => forms.setNewBoardForm({ ...forms.newBoardForm, slug: e.target.value })} placeholder="例如：club-activities" required /></FormField>
                      <FormField label="描述"><input value={forms.newBoardForm.description} onChange={e => forms.setNewBoardForm({ ...forms.newBoardForm, description: e.target.value })} required /></FormField>
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