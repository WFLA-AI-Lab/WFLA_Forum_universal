import { useMemo, useState, type ReactNode } from 'react';
import type { Board, SkinContext, Thread, View } from '../contract';
import './x.css';

type IconName = 'home' | 'notice' | 'community' | 'user' | 'search' | 'settings' | 'bell' | 'bookmark' | 'reply' | 'heart' | 'more' | 'back' | 'send' | 'group' | 'edit' | 'shield' | 'logout';

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.7V21h13V9.7M9 21v-6h6v6"/></>,
    notice: <><path d="M4 13V9l13-5v14L4 13Z"/><path d="m7 14 1.5 6h3L10 13M20 8v6"/></>,
    community: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M14 15a4.5 4.5 0 0 1 6.5 4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.58 15 1.7 1.7 0 0 0 3.03 14H3v-4h.03A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.03V3h4v.03a1.7 1.7 0 0 0 1.05 1.57 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.97 10H21v4h-.03A1.7 1.7 0 0 0 19.4 15Z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z"/>,
    reply: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    back: <><path d="m15 18-6-6 6-6"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
    group: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/></>,
    logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M18 12H8"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function initials(value?: string) {
  const name = value?.trim() || 'W';
  return name.length > 2 ? name.slice(-2) : name;
}

function Avatar({ name, src, size = 44 }: { name?: string; src?: string | null; size?: number }) {
  return <span className="x-avatar" style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" /> : initials(name)}
  </span>;
}

function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <div className="x-empty"><span><Icon name={icon} size={28}/></span><h2>{title}</h2><p>{body}</p></div>;
}

export default function XSkin({ forum }: { forum: SkinContext }) {
  const { site, session, data, forms, messages, actions, view, setView, helpers, ui } = forum;
  const { me, providers, isAdmin } = session;
  const [profileTab, setProfileTab] = useState<'posts' | 'saved'>('posts');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const activeBoard = view.name === 'board' ? view.board : null;
  const activeThread = view.name === 'thread' ? view.thread : null;
  const bookmarkedIds = useMemo(() => new Set(data.bookmarks.map(item => item.id)), [data.bookmarks]);
  const ownThreads = useMemo(() => me ? data.feed.filter(item => item.author_id === me.id) : [], [data.feed, me]);
  const clubBoards = useMemo(() => data.boards.filter(board => /社团|club|societ|协会|学生会/i.test(`${board.name} ${board.slug} ${board.description}`)), [data.boards]);

  function go(next: View) {
    setView(next);
    messages.clearMessages();
  }

  function nav(next: View) {
    return (event: React.MouseEvent) => { event.preventDefault(); go(next); };
  }

  function pageTitle() {
    if (view.name === 'home') return '首页';
    if (view.name === 'announcements') return '公告';
    if (view.name === 'community') return '社区';
    if (view.name === 'profile' || view.name === 'bookmarks' || view.name === 'login') return me ? '用户' : '登录';
    if (view.name === 'settings') return '设置';
    if (view.name === 'notifications') return '通知';
    if (view.name === 'search') return '搜索';
    if (view.name === 'board') return view.board.name;
    if (view.name === 'thread') return '动态';
    if (view.name === 'register') return '注册';
    return 'WFLA';
  }

  function openNotifications() {
    void actions.loadNotifications();
    go({ name: 'notifications' });
  }

  function AuthPanel() {
    return <section className="x-auth">
      <div className="x-auth-brand">W</div>
      <p className="x-eyebrow">WFLA MEMBER ACCESS</p>
      <h1>登录校园社区</h1>
      <p className="x-muted">使用已获准进入论坛的账号继续。</p>
      <form onSubmit={actions.login} className="x-form">
        <label><span>用户名</span><input value={forms.username} onChange={event => forms.setUsername(event.target.value)} autoComplete="username" required placeholder="Username"/></label>
        <label><span>密码</span><input type="password" value={forms.password} onChange={event => forms.setPassword(event.target.value)} autoComplete="current-password" required placeholder="Password"/></label>
        <button className="x-primary" type="submit">登录</button>
      </form>
      {(providers.microsoft || providers.github) && <div className="x-auth-providers">
        {providers.microsoft && <a href={`${site.api_origin}/api/v1/auth/microsoft/login`}>Microsoft 登录</a>}
        {providers.github && <a href={`${site.api_origin}/api/v1/auth/github/login`}>GitHub 登录</a>}
      </div>}
      {site.registration_enabled && <button className="x-text-button" type="button" onClick={() => go({ name: 'register' })}>持有邀请码？创建账号</button>}
    </section>;
  }

  function FeedCard({ thread }: { thread: Thread }) {
    const name = thread.author?.real_name || thread.author?.username || 'WFLAer';
    const verified = ['owner', 'admin', 'moderator'].includes(thread.author?.role || '');
    const bookmarked = bookmarkedIds.has(thread.id);
    return <article className="x-post">
      <Avatar name={name}/>
      <div className="x-post-content">
        <header>
          <b>{name}</b>{verified && <span className="x-verified" title="认证账号"><Icon name="shield" size={15}/></span>}
          <span>@{thread.author?.username || 'wfla'} · {helpers.formatDate(thread.created_at)}</span>
          {thread.is_pinned && <em>置顶</em>}
        </header>
        <button type="button" className="x-post-open" onClick={() => void actions.openThread(thread.id)}>
          {thread.board && <small>{thread.board.name}</small>}
          <h2>{thread.title}</h2>
          {thread.preview_html && <div className="x-post-preview" dangerouslySetInnerHTML={{ __html: thread.preview_html }}/>} 
        </button>
        <footer>
          <button type="button" onClick={() => void actions.openThread(thread.id)} aria-label="查看回复"><Icon name="reply" size={19}/><span>{thread.reply_count}</span></button>
          <button type="button" onClick={() => void actions.likeThread(thread.id)} aria-label="点赞"><Icon name="heart" size={19}/><span>赞</span></button>
          <button type="button" className={bookmarked ? 'active' : ''} onClick={() => void actions.toggleBookmark(thread.id, bookmarked)} aria-label={bookmarked ? '取消收藏' : '收藏'}><Icon name="bookmark" size={19}/></button>
          <span className="x-views">{thread.view_count} 浏览</span>
        </footer>
      </div>
    </article>;
  }

  function Timeline({ items, emptyTitle = '这里还没有内容', emptyBody = '新的校园动态会出现在这里。' }: { items: Thread[]; emptyTitle?: string; emptyBody?: string }) {
    if (!items.length) return <Empty icon="edit" title={emptyTitle} body={emptyBody}/>;
    return <>{items.map(item => <FeedCard key={item.id} thread={item}/>)}</>;
  }

  function Composer({ board }: { board?: Board }) {
    if (!me) return <button type="button" className="x-guest-compose" onClick={() => go({ name: 'profile' })}><Avatar name="W" size={40}/><span>登录后分享校园动态</span><b>登录</b></button>;
    if (!data.boards.length) return <div className="x-soft-note">社区板块建立后即可发布动态。</div>;
    return <form className="x-composer" onSubmit={actions.createThread}>
      <Avatar name={forms.profile?.nickname || me.real_name} src={forms.profile?.avatar_data_url}/>
      <div>
        {!board && <select aria-label="发布到" value={forms.composeBoard} onChange={event => forms.setComposeBoard(event.target.value)} required><option value="">选择发布位置</option>{data.boards.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select>}
        <input aria-label="动态标题" value={forms.newTitle} onChange={event => forms.setNewTitle(event.target.value)} placeholder="发生了什么？" required/>
        <textarea aria-label="动态内容" rows={3} value={forms.newContent} onChange={event => forms.setNewContent(event.target.value)} placeholder="分享校园里的新鲜事…" required/>
        <div className="x-composer-actions"><span>实名社区 · 尊重每一种声音</span><button type="submit" className="x-primary">发布</button></div>
      </div>
    </form>;
  }

  function Home() {
    return <><div className="x-page-intro"><div><span className="x-live"><i/>LIVE</span><h1>校园动态</h1><p>来自 WFLAer 的实时分享</p></div></div><Composer/><Timeline items={data.feed}/>{data.feedCursor && <div className="x-load"><button type="button" onClick={() => void actions.loadMoreFeed()} disabled={data.feedBusy}>{data.feedBusy ? '正在加载…' : '加载更多'}</button></div>}</>;
  }

  function Announcements() {
    return <><div className="x-page-intro official"><div><span className="x-eyebrow">VERIFIED ONLY</span><h1>官方公告</h1><p>仅展示学校官方账号和社团总账号发布的重要内容</p></div><Icon name="shield" size={36}/></div>
      {!data.announcements.length ? <Empty icon="notice" title="暂无公告" body="认证账号发布的重要通知会显示在这里。"/> : data.announcements.map(item => <article key={item.id} className={`x-announcement ${item.level}`}>
        <div className="x-announcement-icon"><Icon name="shield" size={20}/></div><div><header><b>{item.author_real_name}</b><span className="x-verified"><Icon name="shield" size={15}/></span><em>{ui.levelLabel[item.level] || item.level}</em><time>{helpers.formatDate(item.starts_at)}</time></header><h2>{item.title}</h2><div className="x-rich" dangerouslySetInnerHTML={{ __html: item.content_html }}/></div>
      </article>)}</>;
  }

  function Community() {
    if (!me) return <AuthPanel/>;
    const contacts = data.searchResults?.users.filter(user => user.id !== me.id) ?? [];
    const selected = contacts.find(user => user.id === selectedContact);
    return <><div className="x-page-intro"><div><span className="x-eyebrow">WFLA COMMUNITY</span><h1>社区</h1><p>在社团群组中交流，或查找一个联系人</p></div></div>
      <div className="x-community">
        <section className="x-community-list">
          <header><h2>社团群组</h2><span>{clubBoards.length}</span></header>
          {clubBoards.length ? clubBoards.map(board => <button key={board.id} type="button" className="x-community-row" onClick={() => go({ name: 'board', board })}><span className="x-group-icon"><Icon name="group"/></span><span><b>{board.name}</b><small>{board.description || '社团成员交流区'}</small></span><i>进入</i></button>) : <div className="x-community-empty">暂无已启用的社团交流群</div>}
          <header><h2>联系人</h2></header>
          <form className="x-contact-search" onSubmit={event => { event.preventDefault(); void actions.searchForum(forms.searchQuery).then(() => setView({ name: 'community' })); }}><Icon name="search" size={18}/><input value={forms.searchQuery} onChange={event => forms.setSearchQuery(event.target.value)} placeholder="搜索姓名或用户名"/><button type="submit">搜索</button></form>
          {data.searchBusy ? <div className="x-community-empty">正在搜索…</div> : contacts.map(user => <button key={user.id} type="button" className={selectedContact === user.id ? 'x-community-row active' : 'x-community-row'} onClick={() => setSelectedContact(user.id)}><Avatar name={user.real_name} size={40}/><span><b>{user.real_name}</b><small>{user.enrollment_year} 入学 · {ui.roleLabel[user.role] || user.role}</small></span></button>)}
          {data.searchResultQuery && !data.searchBusy && !contacts.length && <div className="x-community-empty">未找到联系人</div>}
        </section>
        <section className="x-conversation">
          {selected ? <><header><Avatar name={selected.real_name} size={38}/><div><b>{selected.real_name}</b><small>{selected.enrollment_year} 入学</small></div></header><Empty icon="send" title="尚未开始对话" body="私信接口开放后，对话内容会显示在这里。"/><div className="x-message-compose"><input disabled placeholder="私信功能等待后端接口"/><button disabled><Icon name="send" size={18}/></button></div></> : <Empty icon="community" title="选择一个联系人" body="搜索并选择联系人以打开交流窗口。"/>}
        </section>
      </div>
    </>;
  }

  function UserPage() {
    if (!me) return <AuthPanel/>;
    return <><section className="x-profile-hero"><div className="x-profile-cover"/><div className="x-profile-main"><Avatar name={forms.profile?.nickname || me.real_name} src={forms.profile?.avatar_data_url} size={84}/><button type="button" onClick={() => go({ name: 'settings' })}>编辑个人资料</button><h1>{forms.profile?.nickname || me.real_name}</h1><p>@{me.username}</p><div><span>{me.real_name}</span><span>{me.enrollment_year} 入学</span><span>{ui.roleLabel[me.role] || me.role}</span></div></div></section>
      <div className="x-tabs"><button type="button" className={profileTab === 'posts' ? 'active' : ''} onClick={() => setProfileTab('posts')}>我发布的</button><button type="button" className={profileTab === 'saved' ? 'active' : ''} onClick={() => { setProfileTab('saved'); void actions.loadBookmarks(); }}>收藏</button></div>
      {profileTab === 'posts' ? <Timeline items={ownThreads} emptyTitle="还没有发布内容" emptyBody="你发布的动态和帖子会集中显示在这里。"/> : <Timeline items={data.bookmarks} emptyTitle="还没有收藏" emptyBody="收藏的动态和帖子会集中显示在这里。"/>}</>;
  }

  function Settings() {
    if (!me) return <AuthPanel/>;
    return <div className="x-settings">
      <section><header><span><Icon name="user"/></span><div><h2>个人资料</h2><p>修改社区中展示的头像与昵称</p></div></header><form className="x-form" onSubmit={actions.saveProfile}><div className="x-avatar-editor"><Avatar name={forms.profileForm.nickname || me.real_name} src={forms.profileForm.avatar_data_url} size={72}/><label className="x-file">选择头像<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 256 * 1024) { messages.setError('头像文件不能超过 256KB'); return; } const reader = new FileReader(); reader.onload = () => forms.setProfileForm(current => ({ ...current, avatar_data_url: String(reader.result) })); reader.readAsDataURL(file); }}/></label></div><label><span>昵称</span><input maxLength={24} value={forms.profileForm.nickname} onChange={event => forms.setProfileForm(current => ({ ...current, nickname: event.target.value }))} required/></label><div className="x-settings-actions"><button type="submit" className="x-primary">保存修改</button>{forms.profileForm.avatar_data_url && <button type="button" onClick={() => forms.setProfileForm(current => ({ ...current, avatar_data_url: null }))}>移除头像</button>}</div></form></section>
      <section><header><span><Icon name="settings"/></span><div><h2>偏好设置</h2><p>当前账号的界面与内容偏好</p></div></header><div className="x-preference-row"><div><b>界面样式</b><small>WFLA X · 自动适配手机和电脑</small></div><span className="x-badge">已启用</span></div><div className="x-preference-row"><div><b>动态刷新</b><small>页面可见时每 15 秒同步最新内容</small></div><span className="x-badge live">实时</span></div></section>
      <section><header><span><Icon name="shield"/></span><div><h2>账号</h2><p>{me.real_name} · {me.enrollment_year} 入学 · {ui.roleLabel[me.role] || me.role}</p></div></header><button type="button" className="x-danger-button" onClick={() => void actions.logout()}><Icon name="logout" size={18}/>退出登录</button></section>
    </div>;
  }

  function BoardPage() {
    if (!activeBoard) return null;
    return <><div className="x-page-intro"><div><button className="x-back" type="button" onClick={() => go({ name: 'community' })}><Icon name="back" size={20}/>社区</button><h1>{activeBoard.name}</h1><p>{activeBoard.description}</p></div></div><Composer board={activeBoard}/><Timeline items={data.threads} emptyTitle="群组里还没有内容" emptyBody="成为第一个发起交流的人。"/></>;
  }

  function ThreadPage() {
    if (!activeThread) return null;
    return <><button className="x-thread-back" type="button" onClick={() => go({ name: 'home' })}><Icon name="back"/>返回</button><article className="x-thread-head"><h1>{activeThread.title}</h1><p>{activeThread.author?.real_name} · {helpers.formatDate(activeThread.created_at)} · {activeThread.view_count} 浏览</p></article>{data.posts.map(post => <article key={post.id} className="x-reply"><Avatar name={post.author?.real_name}/><div><header><b>{post.author?.real_name || 'WFLAer'}</b><span>#{post.floor_number} · {helpers.formatDate(post.created_at)}</span></header><div className="x-rich" dangerouslySetInnerHTML={{ __html: post.content_html }}/>{me && post.author_id !== me.id && <button type="button" onClick={() => void actions.submitReport('post', post.id)}>举报</button>}</div></article>)}{me ? <form className="x-reply-form" onSubmit={actions.createReply}><textarea rows={3} value={forms.reply} onChange={event => forms.setReply(event.target.value)} placeholder="回复这条动态…" required/><button className="x-primary" type="submit">回复</button></form> : <div className="x-soft-note">登录后参与讨论。</div>}</>;
  }

  function SearchPage() {
    return <><form className="x-search-page" onSubmit={event => { event.preventDefault(); void actions.searchForum(forms.searchQuery); }}><Icon name="search"/><input autoFocus value={forms.searchQuery} onChange={event => forms.setSearchQuery(event.target.value)} placeholder="搜索动态、帖子或用户"/><button type="submit">搜索</button></form>{data.searchBusy ? <div className="x-community-empty">正在搜索…</div> : !data.searchResults ? <Empty icon="search" title="搜索 WFLA" body="输入关键词，查找校园中的内容与用户。"/> : <><Timeline items={data.searchResults.threads} emptyTitle="没有相关动态" emptyBody="尝试使用不同的关键词。"/>{data.searchResults.users.length > 0 && <section className="x-search-users"><h2>用户</h2>{data.searchResults.users.map(user => <div key={user.id}><Avatar name={user.real_name} size={38}/><span><b>{user.real_name}</b><small>{user.enrollment_year} 入学</small></span></div>)}</section>}</>}</>;
  }

  function Notifications() {
    const unread = data.notifications.filter(item => !item.is_read).length;
    return <><div className="x-action-header"><span>{unread} 条未读</span>{unread > 0 && <button type="button" onClick={() => void actions.markAllNotificationsRead()}>全部已读</button>}</div>{!data.notifications.length ? <Empty icon="bell" title="暂无通知" body="回复、公告和系统提醒会显示在这里。"/> : data.notifications.map(item => <button key={item.id} className={item.is_read ? 'x-notification read' : 'x-notification'} type="button" onClick={() => void actions.markNotificationRead(item.id)}><span><Icon name={item.type === 'announcement' ? 'notice' : 'bell'}/></span><div><b>{item.title}</b><p>{item.body}</p><small>{helpers.formatDate(item.created_at)}</small></div></button>)}</>;
  }

  function Register() {
    if (!site.registration_enabled) return <Empty icon="user" title="注册暂未开放" body="请联系管理组获取账号。"/>;
    return <section className="x-auth register"><p className="x-eyebrow">INVITATION ONLY</p><h1>创建校园账号</h1><p className="x-muted">需要有效邀请码，提交后等待管理员激活。</p><form className="x-form" onSubmit={actions.register}><label><span>邀请码</span><input value={forms.regForm.invitation_code} onChange={event => forms.setRegForm(current => ({ ...current, invitation_code: event.target.value }))} required/></label><label><span>用户名</span><input value={forms.regForm.username} onChange={event => forms.setRegForm(current => ({ ...current, username: event.target.value }))} autoComplete="username" required/></label><label><span>真实姓名</span><input value={forms.regForm.real_name} onChange={event => forms.setRegForm(current => ({ ...current, real_name: event.target.value }))} required/></label><label><span>高中入学年份</span><input inputMode="numeric" value={forms.regForm.enrollment_year} onChange={event => forms.setRegForm(current => ({ ...current, enrollment_year: event.target.value }))} placeholder="例如 2026" required/></label><label><span>密码</span><input type="password" value={forms.regForm.password} onChange={event => forms.setRegForm(current => ({ ...current, password: event.target.value }))} autoComplete="new-password" required/></label><button className="x-primary" type="submit">提交注册申请</button></form><button className="x-text-button" type="button" onClick={() => go({ name: 'profile' })}>返回登录</button></section>;
  }

  function Body() {
    if (view.name === 'home') return <Home/>;
    if (view.name === 'announcements') return <Announcements/>;
    if (view.name === 'community') return <Community/>;
    if (view.name === 'profile' || view.name === 'bookmarks' || view.name === 'login') return <UserPage/>;
    if (view.name === 'settings') return <Settings/>;
    if (view.name === 'board') return <BoardPage/>;
    if (view.name === 'thread') return <ThreadPage/>;
    if (view.name === 'search') return <SearchPage/>;
    if (view.name === 'notifications') return <Notifications/>;
    if (view.name === 'register') return <Register/>;
    return <Empty icon="home" title="页面不存在" body="请从导航栏选择一个页面。"/>;
  }

  const navItems: { name: 'home' | 'announcements' | 'community' | 'profile'; label: string; icon: IconName }[] = [
    { name: 'home', label: '首页', icon: 'home' }, { name: 'announcements', label: '公告', icon: 'notice' }, { name: 'community', label: '社区', icon: 'community' }, { name: 'profile', label: '用户', icon: 'user' }
  ];
  const currentName = view.name === 'login' || view.name === 'bookmarks' ? 'profile' : view.name;

  return <div className="x-app">
    <div className="x-shell">
      <aside className="x-rail">
        <button className="x-logo" type="button" onClick={() => go({ name: 'home' })}><span>W</span><b>WFLA</b></button>
        <nav>{navItems.map(item => <a key={item.name} href="#" className={currentName === item.name ? 'active' : ''} onClick={nav({ name: item.name })}><Icon name={item.icon}/><span>{item.label}</span></a>)}</nav>
        {me && <button className="x-compose-button" type="button" onClick={() => go({ name: 'home' })}><Icon name="edit" size={19}/><span>发布动态</span></button>}
        <div className="x-account-mini">{me ? <><Avatar name={forms.profile?.nickname || me.real_name} src={forms.profile?.avatar_data_url} size={40}/><div><b>{forms.profile?.nickname || me.real_name}</b><span>@{me.username}</span></div><button type="button" aria-label="设置" onClick={() => go({ name: 'settings' })}><Icon name="more" size={20}/></button></> : <button className="x-signin-mini" type="button" onClick={() => go({ name: 'profile' })}>登录</button>}</div>
      </aside>
      <main className="x-main">
        <header className="x-topbar"><h1>{pageTitle()}</h1><div><button type="button" aria-label="搜索" onClick={() => go({ name: 'search' })}><Icon name="search" size={20}/></button>{me && <button type="button" aria-label="通知" className="x-bell-button" onClick={openNotifications}><Icon name="bell" size={20}/>{data.notifications.some(item => !item.is_read) && <i/>}</button>}<button type="button" aria-label="设置" onClick={() => go({ name: 'settings' })}><Icon name="settings" size={20}/></button></div></header>
        {messages.error && <div className="x-flash error">{messages.error}<button type="button" onClick={() => messages.setError('')}>×</button></div>}
        {messages.success && <div className="x-flash success">{messages.success}<button type="button" onClick={() => messages.setSuccess('')}>×</button></div>}
        <Body/>
      </main>
      <aside className="x-aside">
        <form className="x-aside-search" onSubmit={event => { event.preventDefault(); void actions.searchForum(forms.searchQuery); }}><Icon name="search" size={18}/><input value={forms.searchQuery} onChange={event => forms.setSearchQuery(event.target.value)} placeholder="搜索 WFLA"/></form>
        <section><header><h2>重要公告</h2><button type="button" onClick={() => go({ name: 'announcements' })}>查看全部</button></header>{data.announcements.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => go({ name: 'announcements' })}><small>{ui.levelLabel[item.level] || item.level} · {item.author_real_name}</small><b>{item.title}</b></button>)}{!data.announcements.length && <p>暂无重要公告</p>}</section>
        <section><header><h2>社区空间</h2></header>{data.boards.slice(0, 5).map(board => <button key={board.id} type="button" onClick={() => go({ name: 'board', board })}><b>{board.name}</b><small>{board.description || '进入交流'}</small></button>)}{!data.boards.length && <p>社区空间正在准备中</p>}</section>
        {isAdmin && <a className="x-admin-link" href="/admin"><Icon name="shield" size={18}/>管理后台</a>}
        <footer>© 2026 WFLA · 校园社区</footer>
      </aside>
    </div>
    <nav className="x-mobile-nav">{navItems.map(item => <button key={item.name} type="button" className={currentName === item.name ? 'active' : ''} aria-label={item.label} onClick={() => go({ name: item.name })}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
  </div>;
}

