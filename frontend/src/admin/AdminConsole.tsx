import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { SiteConfig, User } from '../skins/contract';
import { UsersPanel } from './UsersPanel';
import { ContentPanel } from './ContentPanel';
import { ReportsPanel } from './ReportsPanel';
import { OperationsPanel } from './OperationsPanel';
import { AutomationPanel } from './AutomationPanel';
import { SystemPanel } from './SystemPanel';
import { Empty, formatDate, formatDay } from './shared';
import './admin.css';

export type AdminSection = 'overview' | 'users' | 'content' | 'reports' | 'risks' | 'invitations' | 'announcements' | 'audit' | 'appearance' | 'settings' | 'system';

interface AdminConsoleProps {
  me: User;
  site: SiteConfig;
  initialTab?: AdminSection;
  onExit: () => void;
  onSettingsChanged: () => Promise<void>;
}

interface OverviewData {
  generated_at: string;
  users: { total: number; active: number; pending: number; muted: number; banned: number; roles: Record<string, number> };
  content: { threads: number; published_threads: number; hidden_threads: number; locked_threads: number; posts: number; published_posts: number; hidden_posts: number; views: number; replies: number };
  moderation: { reports: number; open: number; in_review: number; resolved: number; rejected: number };
  invitations: { total: number; unused: number; expired: number; used: number };
  trend: { day: string; users: number; threads: number; posts: number }[];
  alerts: { level: 'info' | 'warning'; message: string }[];
  recent_activity: { id: string; action: string; target_type: string; target_id: string; created_at: string; actor_real_name?: string | null }[];
  hot_threads: { id: string; title: string; reply_count: number; view_count: number; author_real_name: string }[];
}

const ROLE_LABEL: Record<string, string> = { owner: '负责人', admin: '管理员', moderator: '监管者', member: '成员' };
const ACTION_LABEL: Record<string, string> = {
  'user.create': '创建账号', 'user.activate': '激活账号', 'user.role_change': '变更角色', 'user.status_change': '变更状态',
  'user.password_reset': '重置密码', 'user.sessions_revoke': '撤销会话', 'user.note_create': '添加备注',
  'invitation.create': '生成邀请码', 'invitation.revoke': '吊销邀请码', 'report.resolve': '处理举报', 'report.reject': '驳回举报',
  'report.assign': '分配举报', 'thread.status_change': '变更话题状态', 'post.status_change': '变更回复状态', 'post.edit': '编辑回复', 'post.delete': '删除回复',
  'announcement.create': '发布公告', 'announcement.delete': '删除公告', 'board.create': '创建板块',
  'settings.update': '更新高级设置', 'site.config_update': '更新站点配置', 'moderation.rule_update': '更新自动规则', 'risk.dismiss': '忽略风险事件', 'appeal.create': '提交申诉', 'appeal.approve': '通过申诉', 'appeal.reject': '驳回申诉'
};

const NAV: { id: AdminSection; label: string; hint: string; ownerOnly?: boolean; icon: ReactNode }[] = [
  { id: 'overview', label: '概览', hint: 'Overview', icon: <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" /> },
  { id: 'users', label: '账号', hint: 'People', icon: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></> },
  { id: 'content', label: '内容', hint: 'Moderation', icon: <><path d="M5 5h14v14H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></> },
  { id: 'reports', label: '举报', hint: 'Queue', icon: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17.3v.2" /></> },
  { id: 'invitations', label: '邀请码', hint: 'Access', icon: <><path d="M4 8h16v8H4z" /><circle cx="8" cy="12" r="2" /><path d="M13 10h4M13 14h4" /></> },
  { id: 'announcements', label: '公告与板块', hint: 'Publishing', icon: <><path d="M4 12 19 5v14L4 12Z" /><path d="m7 13 1.6 6h3L10 12" /></> },
  { id: 'risks', label: '自动监管', hint: 'Automation', icon: <><circle cx='12' cy='12' r='8' /><path d='M12 4v4M12 16v4M4 12h4M16 12h4' /></> },
  { id: 'audit', label: '审计日志', hint: 'Audit', icon: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></> },
  { id: 'appearance', label: '外观', hint: 'Experience', ownerOnly: true, icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16M4 12h16" /></> },
  { id: 'settings', label: '高级设置', hint: 'Owner only', ownerOnly: true, icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.58 15 1.7 1.7 0 0 0 3.03 14H3v-4h.03A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.03V3h4v.03A1.7 1.7 0 0 0 15.05 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.97 10H21v4h-.03A1.7 1.7 0 0 0 19.4 15Z" /></> },
  { id: 'system', label: '系统诊断', hint: 'Health', ownerOnly: true, icon: <><path d="M4 19h16M6 19V9l6-4 6 4v10" /><path d="M10 19v-5h4v5" /></> }
];

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
export default function AdminConsole({ me, site, initialTab = 'overview', onExit, onSettingsChanged }: AdminConsoleProps) {
  const [section, setSection] = useState<AdminSection>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const isOwner = me.role === 'owner';
  const sections = NAV.filter(item => !item.ownerOnly || isOwner);

  useEffect(() => {
    if (section !== 'overview') return;
    let cancelled = false;
    setLoading(true);
    api.get<OverviewData>('/admin/overview')
      .then(data => { if (!cancelled) setOverview(data); })
      .catch(error => { if (!cancelled) notify('error', error instanceof Error ? error.message : '无法加载概览'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [section]);

  function notify(tone: 'success' | 'error', message: string) {
    setToast({ tone, message });
    window.setTimeout(() => setToast(current => current?.message === message ? null : current), 3600);
  }

  function chooseSection(next: AdminSection) {
    setSection(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const title = sections.find(item => item.id === section)?.label ?? '后台';
  const avatar = me.real_name.slice(-1);

  return (
    <div className="adm-shell">
      <button type="button" className={`adm-scrim ${sidebarOpen ? 'show' : ''}`} aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />
      <aside className={`adm-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="adm-brand">
          <span className="adm-seal">世</span>
          <div><b>{site.forum_name}</b><small>ADMIN CONSOLE</small></div>
          <button type="button" className="adm-side-close" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        <nav aria-label="后台导航">
          {sections.map(item => (
            <button key={item.id} type="button" className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => chooseSection(item.id)}>
              <span className="adm-nav-icon"><Icon>{item.icon}</Icon></span>
              <span><b>{item.label}</b><small>{item.hint}</small></span>
            </button>
          ))}
        </nav>
        <div className="adm-sidebar-footer">
          <div className="adm-me"><span>{avatar}</span><div><b>{me.real_name}</b><small>{ROLE_LABEL[me.role]} · {me.enrollment_year} 届</small></div></div>
          <button type="button" onClick={onExit}>返回论坛</button>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-topbar">
          <button type="button" className="adm-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="adm-heading"><small>WFLA WALL / CONTROL</small><h1>{title}</h1></div>
          <div className="adm-top-actions">
            <span className={`adm-live ${loading ? 'busy' : ''}`}><i />{loading ? '同步中' : '已连接'}</span>
            <button type="button" className="adm-icon-btn" aria-label="刷新" onClick={() => chooseSection(section)}>↻</button>
          </div>
        </header>

        <div className="adm-content">
          {section === 'overview' && renderOverview()}
          {section === 'users' && <UsersPanel me={me} notify={notify} />}
          {section === 'content' && <ContentPanel notify={notify} />}
          {section === 'reports' && <ReportsPanel notify={notify} />}
          {section === 'invitations' && <OperationsPanel mode="invitations" me={me} notify={notify} />}
          {section === 'announcements' && <OperationsPanel mode="announcements" me={me} notify={notify} />}
          {section === 'risks' && <AutomationPanel notify={notify} canEdit={me.role === 'owner'} />}
          {section === 'audit' && <OperationsPanel mode="audit" me={me} notify={notify} />}
          {section === 'appearance' && isOwner && <SystemPanel mode="appearance" me={me} site={site} notify={notify} onSettingsChanged={onSettingsChanged} />}
          {section === 'settings' && isOwner && <SystemPanel mode="settings" me={me} site={site} notify={notify} onSettingsChanged={onSettingsChanged} />}
          {section === 'system' && isOwner && <SystemPanel mode="system" me={me} site={site} notify={notify} onSettingsChanged={onSettingsChanged} />}
        </div>
      </main>

      {toast && <div className={`adm-toast ${toast.tone}`} role="status"><span>{toast.tone === 'success' ? '✓' : '!'}</span><p>{toast.message}</p><button type="button" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    </div>
  );

  function renderOverview() {
    if (!overview) return <div className="adm-skeleton"><span /><span /><span /><span /></div>;
    const max = Math.max(1, ...overview.trend.flatMap(point => [point.users, point.threads, point.posts]));
    const width = 708;
    const x = (index: number) => 34 + index * (width / Math.max(1, overview.trend.length - 1));
    const y = (value: number) => 222 - (value / max) * 180;
    const path = (series: 'users' | 'threads' | 'posts') => overview.trend.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point[series])}`).join(' ');
    return (
      <>
        <section className="adm-hero">
          <div><p>论坛运行概览</p><h2>今天，一切都在秩序中生长。</h2><span>数据生成于 {formatDate(overview.generated_at)}</span></div>
          <button type="button" className="adm-primary" onClick={() => chooseSection('users')}>管理账号</button>
        </section>
        <section className="adm-alerts">
          {overview.alerts.length === 0
            ? <div className="adm-alert quiet"><b>运行平稳</b><span>当前没有需要立即处理的事项。</span></div>
            : overview.alerts.map((alert, index) => (
              <div key={index} className={`adm-alert ${alert.level}`}><i /><b>{alert.message}</b><button type="button" onClick={() => chooseSection(alert.message.includes('举报') ? 'reports' : alert.message.includes('邀请') ? 'invitations' : 'users')}>处理</button></div>
            ))}
        </section>
        <section className="adm-stat-grid">
          <Stat label="总账号" value={overview.users.total} note={`${overview.users.active} 个正常`} tone="blue" />
          <Stat label="待激活" value={overview.users.pending} note={overview.users.pending ? '需要人工审核' : '队列已清空'} tone={overview.users.pending ? 'orange' : 'green'} />
          <Stat label="话题" value={overview.content.threads} note={`${overview.content.replies} 条回复`} tone="violet" />
          <Stat label="待处理举报" value={overview.moderation.open + overview.moderation.in_review} note={`累计 ${overview.moderation.reports} 条`} tone={overview.moderation.open + overview.moderation.in_review ? 'red' : 'green'} />
          <Stat label="累计浏览" value={overview.content.views} note={`${overview.content.posts} 条回复内容`} tone="cyan" />
          <Stat label="可用邀请码" value={overview.invitations.unused} note={`${overview.invitations.used} 个已使用`} tone="green" />
        </section>
        <section className="adm-dashboard-grid">
          <article className="adm-card adm-chart-card">
            <header><div><small>14 DAY PULSE</small><h3>社区活跃趋势</h3></div><div className="adm-legend"><span className="users">账号</span><span className="threads">话题</span><span className="posts">回复</span></div></header>
            <div className="adm-chart">
              <svg viewBox="0 0 760 250" role="img" aria-label="最近十四天社区活跃度">
                {[0, 1, 2, 3, 4].map(line => <line key={line} x1="34" x2="742" y1={28 + line * 45} y2={28 + line * 45} className="grid" />)}
                {(['users', 'threads', 'posts'] as const).map(series => <path key={series} d={path(series)} className={`line ${series}`} />)}
                {overview.trend.map((point, index) => <g key={point.day}><circle cx={x(index)} cy={y(point.posts)} r="3" className="dot posts" /><text x={x(index)} y="244" textAnchor="middle">{formatDay(point.day)}</text></g>)}
              </svg>
            </div>
          </article>
          <article className="adm-card adm-role-card">
            <header><div><small>IDENTITY</small><h3>角色分布</h3></div></header>
            <RoleBar label="负责人" value={overview.users.roles.owner ?? 0} total={overview.users.total} tone="ink" />
            <RoleBar label="管理员" value={overview.users.roles.admin ?? 0} total={overview.users.total} tone="blue" />
            <RoleBar label="监管者" value={overview.users.roles.moderator ?? 0} total={overview.users.total} tone="violet" />
            <RoleBar label="成员" value={overview.users.roles.member ?? 0} total={overview.users.total} tone="green" />
            <div className="adm-role-footer"><span>账号健康度</span><b>{overview.users.total ? Math.round((overview.users.active / overview.users.total) * 100) : 100}%</b></div>
          </article>
        </section>
        <section className="adm-dashboard-grid lower">
          <article className="adm-card">
            <header><div><small>RECENT ACTIVITY</small><h3>最近管理动作</h3></div><button type="button" className="adm-text-btn" onClick={() => chooseSection('audit')}>查看全部</button></header>
            <div className="adm-activity-list">
              {overview.recent_activity.length === 0 ? <Empty text="还没有管理操作记录" /> : overview.recent_activity.slice(0, 7).map(item => (
                <div key={item.id}><span className="adm-avatar tiny">{item.actor_real_name?.slice(-1) ?? '·'}</span><div><b>{ACTION_LABEL[item.action] ?? item.action}</b><small>{item.actor_real_name ?? '系统'} · {item.target_type} · {formatDate(item.created_at)}</small></div><code>{item.target_id.slice(0, 8)}</code></div>
              ))}
            </div>
          </article>
          <article className="adm-card">
            <header><div><small>HOT TOPICS</small><h3>高热话题</h3></div><button type="button" className="adm-text-btn" onClick={() => chooseSection('content')}>内容管理</button></header>
            <div className="adm-hot-list">
              {overview.hot_threads.length === 0 ? <Empty text="暂无热门话题" /> : overview.hot_threads.map((thread, index) => (
                <div key={thread.id}><span className="adm-rank">{String(index + 1).padStart(2, '0')}</span><div><b>{thread.title}</b><small>{thread.author_real_name} · {thread.reply_count} 回复 · {thread.view_count} 浏览</small></div></div>
              ))}
            </div>
          </article>
        </section>
      </>
    );
  }
}

function Stat({ label, value, note, tone }: { label: string; value: number; note: string; tone: string }) {
  return <article className={`adm-stat ${tone}`}><span>{label}</span><b>{value.toLocaleString('zh-CN')}</b><small>{note}</small><i /></article>;
}
function RoleBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return <div className="adm-rolebar"><div><span>{label}</span><b>{value}</b></div><div><i className={tone} style={{ width: `${percent}%` }} /></div><small>{percent}%</small></div>;
}
