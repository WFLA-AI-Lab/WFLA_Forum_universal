/**
 * App.tsx — the container.
 *
 * It owns every piece of state, all network calls and all permission logic.
 * Skins (frontend/src/skins/*) are pure presentation: they receive one
 * `SkinContext` object and render it. Adding a skin must never require touching
 * this file beyond registering it in skins/registry.ts.
 *
 * The contract lives in frontend/src/skins/contract.ts and is documented in
 * docs/FRONTEND_SKIN_GUIDE.md.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { createClientId } from './client-id';
import { FALLBACK_SKIN_ID, resolveSkin } from './skins/registry';
import AdminConsole, { type AdminSection } from './admin/AdminConsole';
import './splash.css';
import type {
  AdminSiteConfig,
  AdminTab,
  Announcement,
  AnnouncementFormState,
  Board,
  ChatConversation,
  ChatUser,
  GroupMember,
  ChatMessage,
  Diagnostics,
  InvitationItem,
  InvitationRole,
  NewBoardFormState,
  NotificationItem,
  Post,
  ProfileFormState,
  Provider,
  RegisterFormState,
  ReportItem,
  SearchResults,
  RuntimeSettings,
  SettingsFormState,
  SiteConfig,
  SkinContext,
  SkinDescriptor,
  SkinPreferenceStatus,
  UserPreferences,
  Thread,
  User,
  UserProfile,
  View
} from './skins/contract';

const API_ORIGIN = (import.meta.env.VITE_API_BASE ?? '/api/v1').replace(/\/api\/v1$/, '');

/**
 * A skin is loaded lazily to avoid shipping every layout in the entry bundle.
 * If that late import fails (for example, a missing deployment asset), React
 * unmounts the whole tree. This boundary keeps a visible recovery page instead
 * of leaving the app blank after the splash animation.
 */
function SkinErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (error) return;
    const onError = (event: ErrorEvent) => setError(event.error instanceof Error ? event.error : new Error(event.message));
    const onRejection = (event: PromiseRejectionEvent) => setError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [error]);

  if (!error) return children;
  return (
    <main style={{ minHeight: '100vh', padding: 'clamp(1.5rem, 6vw, 4rem)', fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
      <h1>界面加载失败</h1>
      <p>当前皮肤资源没有完整加载。这通常是部署产物缺失或网络中断导致的。</p>
      <pre style={{ whiteSpace: 'pre-wrap', padding: '1rem', background: '#fff', border: '1px solid #cbd5e1' }}>{error.message}</pre>
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
        <button type="button" onClick={() => { window.sessionStorage.removeItem(SPLASH_SESSION_KEY); window.location.reload(); }}>清除开屏状态并重载</button>
      </div>
    </main>
  );
}
const SKIN_STORAGE_KEY = 'wfla.skin';
const ANNOUNCEMENT_ANCHOR = 'announcements';
const SPLASH_SESSION_KEY = 'wfla.splash.seen';

function shouldShowSplash(): boolean {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try { return window.sessionStorage.getItem(SPLASH_SESSION_KEY) !== '1'; }
  catch { return true; }
}

const ROLE_LABEL: Record<string, string> = { owner: '负责人', admin: '管理员', moderator: '监管者', member: '成员' };
const LEVEL_LABEL: Record<string, string> = { normal: '普通', important: '重要', urgent: '紧急' };
const ADMIN_TABS: { key: AdminTab; en: string; zh: string }[] = [
  { key: 'users', en: 'USERS', zh: '用户' },
  { key: 'reports', en: 'REPORTS', zh: '举报' },
  { key: 'invitations', en: 'INVITATIONS', zh: '邀请码' },
  { key: 'announcements', en: 'POSTS & BOARDS', zh: '公告与板块' },
  { key: 'appearance', en: 'APPEARANCE', zh: '外观' },
  { key: 'settings', en: 'ADVANCED', zh: '高级设置' }
];

const FALLBACK_SITE: SiteConfig = {
  forum_name: '世外墙 WFLA Wall',
  tagline: '世外中学校园论坛',
  version: '0.11.0',
  api_version: 'v1',
  skin_contract_version: 4,
  default_skin: 'x',
  skins: [
    { id: 'x', name: 'WFLA X', description: '响应式校园实时信息流', status: 'stable' },
    { id: 'claude', name: 'WFLA Claude UI', description: '温暖米白、衬线标题与专注内容的响应式界面', status: 'stable' }
  ],
  guest_read_enabled: true,
  registration_enabled: true
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replaceAll('/', '.');
}

/** Reads the visitor's saved skin, ignoring anything unreadable or unknown. */
function readSavedSkin(): string | null {
  try {
    return window.localStorage.getItem(SKIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [showSplash, setShowSplash] = useState(shouldShowSplash);
  const viewKey = view.name === 'board' ? `board:${view.board.slug}` : view.name === 'thread' ? `thread:${view.thread.id}` : view.name === 'admin' ? `admin:${view.tab}` : view.name;
  const [me, setMe] = useState<User | null>(null);
  const [providers, setProviders] = useState<Provider>({ microsoft: false, github: false });
  const [site, setSite] = useState<SiteConfig>(FALLBACK_SITE);
  // The public entry point is always the X skin. A saved account preference is
  // applied only after /me confirms that this browser has an active session.
  const [activeSkin, setActiveSkin] = useState<string>(FALLBACK_SKIN_ID);
  const [skinPreferenceStatus, setSkinPreferenceStatus] = useState<SkinPreferenceStatus>('idle');
  const [boards, setBoards] = useState<Board[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [feed, setFeed] = useState<Thread[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [bookmarks, setBookmarks] = useState<Thread[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchResultQuery, setSearchResultQuery] = useState<string | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchRequestId = useRef(0);
  const feedRef = useRef<Thread[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatNextCursor, setChatNextCursor] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [regForm, setRegForm] = useState<RegisterFormState>({
    invitation_code: '', student_number: '', password: '', real_name: '', nickname: '', avatar_data_url: null
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({ nickname: '', avatar_data_url: null });
  const [reply, setReply] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [composeBoard, setComposeBoard] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatDraft, setChatDraft] = useState('');

  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminReports, setAdminReports] = useState<ReportItem[]>([]);
  const [adminInvitations, setAdminInvitations] = useState<InvitationItem[]>([]);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>({ title: '', content: '', level: 'normal', ends_at: '' });
  const [newBoardForm, setNewBoardForm] = useState<NewBoardFormState>({ name: '', slug: '', description: '' });
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [siteConfig, setSiteConfig] = useState<AdminSiteConfig | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>({
    forum_name: '', public_origin: '', session_ttl_seconds: 604800, cookie_secure: false,
    cookie_samesite: 'Lax' as 'Lax' | 'Strict', trust_proxy_headers: false,
    github_client_id: '', github_client_secret: '', github_redirect_uri: '', clear_github_client_secret: false,
    microsoft_client_id: '', microsoft_client_secret: '', microsoft_redirect_uri: '', clear_microsoft_client_secret: false,
    confirm_password: ''
  });

  const isStaff = me ? me.status === 'active' && ['moderator', 'admin', 'owner'].includes(me.role) : false;
  const isAdmin = me ? me.status === 'active' && ['moderator', 'admin', 'owner'].includes(me.role) : false; // legacy flag: standalone moderation console
  const isOwner = me?.status === 'active' && me.role === 'owner';
  const adminTab = view.name === 'admin' ? view.tab : null;

  useEffect(() => {
    void loadBase();
    // The OAuth callback redirects back here with a short status marker. Show it
    // once, then strip it from the address bar so a refresh does not repeat it.
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked');
    const oauthError = params.get('oauth_error');
    if (linked) {
      const label = linked === 'microsoft' ? 'Microsoft' : linked === 'github' ? 'GitHub' : linked;
      setSuccess(`${label} 账号已绑定到本论坛账号`);
    }
    if (oauthError) setError(oauthError);
    if (linked || oauthError) {
      params.delete('linked');
      params.delete('oauth_error');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  }, []);

  useEffect(() => {
    if (!showSplash) return;
    try { window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1'); } catch { /* storage may be unavailable */ }
    const timer = window.setTimeout(() => setShowSplash(false), 3300);
    return () => window.clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => { window.scrollTo(0, 0); }, [viewKey]);
  useEffect(() => { feedRef.current = feed; }, [feed]);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  useEffect(() => {
    if (me) {
      void loadBookmarks();
      void loadConversations();
    } else {
      setBookmarks([]);
      setConversations([]);
      setActiveConversation(null);
      setChatMessages([]);
    }
  }, [me?.id]);

  useEffect(() => {
    if (!me || view.name !== 'community') return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        if (!activeConversation) {
          await loadConversations();
          return;
        }
        const latest = chatMessagesRef.current[chatMessagesRef.current.length - 1];
        const query = latest
          ? `after=${encodeURIComponent(latest.id)}&limit=100`
          : 'limit=100';
        const page = await api.get<{ items: ChatMessage[]; next_after: string | null }>(
          `/conversations/${activeConversation.id}/messages?${query}`
        );
        if (cancelled) return;
        const incoming = latest ? page.items : [...page.items].reverse();
        setChatMessages(current => {
          const known = new Set(current.map(item => item.id));
          return [...current, ...incoming.filter(item => !known.has(item.id))];
        });
        const newest = incoming[incoming.length - 1];
        if (newest) await markConversationRead(activeConversation.id, newest.id);
        await loadConversations();
      } catch { /* Preserve the open conversation during transient polling failures. */ }
    };
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [me?.id, view.name, activeConversation?.id]);

  // The backend currently exposes a paginated timeline rather than a stream.
  // Poll the first page while the tab is visible so the home feed and official
  // announcements update without requiring a manual refresh. Once a reader has
  // loaded later pages, merge updates into the existing list instead of
  // resetting it to page one.
  useEffect(() => {
    if (!me && !site.guest_read_enabled) return;
    let cancelled = false;
    const refreshLiveData = async () => {
      if (document.hidden) return;
      try {
        const [feedPage, announcementPage] = await Promise.all([
          api.get<{ items: Thread[]; next_cursor: string | null }>('/feed?limit=20'),
          api.get<{ items: Announcement[] }>('/announcements')
        ]);
        if (cancelled) return;
        if (feedRef.current.length > feedPage.items.length) {
          setFeed(current => {
            const incoming = new Map(feedPage.items.map(item => [item.id, item]));
            const updated = current.map(item => incoming.get(item.id) ?? item);
            const added = feedPage.items.filter(item => !current.some(existing => existing.id === item.id));
            return [...added, ...updated];
          });
        } else {
          setFeed(feedPage.items);
          setFeedCursor(feedPage.next_cursor);
        }
        setAnnouncements(announcementPage.items);
      } catch { /* Keep the last successful timeline during transient outages. */ }
    };
    const timer = window.setInterval(() => void refreshLiveData(), 15_000);
    const onVisible = () => { if (!document.hidden) void refreshLiveData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [me?.id, site.guest_read_enabled]);

  /**
   * Publishes the active skin to the document. Page-level styling (body
   * background, contour art) keys off these attributes, which keeps each skin
   * from having to mutate global state on its own.
   */
  useEffect(() => {
    document.documentElement.dataset.skin = activeSkin;
    document.body.className = resolveSkin(activeSkin).bodyClass;
  }, [activeSkin]);

  /**
   * After a successful sign-in, prefer the skin saved on the account.
   * Falls back to mirroring the current browser choice into the account so a
   * brand-new member keeps the layout they were already looking at.
   */
  async function adoptAccountSkin() {
    try {
      const d = await api.get<{ preferences: UserPreferences }>('/me/preferences');
      const allowed = site.skins.length > 0 ? site.skins : FALLBACK_SITE.skins;
      const accountChoice = d.preferences.skin_id && allowed.some(skin => skin.id === d.preferences.skin_id)
        ? d.preferences.skin_id
        : null;
      if (accountChoice) {
        setActiveSkin(accountChoice);
        try { window.localStorage.setItem(SKIN_STORAGE_KEY, accountChoice); } catch { /* storage may be unavailable */ }
        setSkinPreferenceStatus('saved');
        return;
      }
      const browserChoice = readSavedSkin();
      if (browserChoice && allowed.some(skin => skin.id === browserChoice)) {
        await api.put('/me/preferences/skin', { skin_id: browserChoice });
        setSkinPreferenceStatus('saved');
      } else {
        setSkinPreferenceStatus('idle');
      }
    } catch {
      setSkinPreferenceStatus('error');
    }
  }

  /**
   * Applies a skin and remembers the choice.
   *
   * The layout switches immediately and is always cached in localStorage so the
   * very first paint on the next visit is already correct. When a member is
   * signed in we additionally PUT it to their account, so the choice follows
   * them to another browser; that call is best-effort and never blocks the UI.
   */
  function applySkinChoice(id: string) {
    if (!me) {
      setActiveSkin(FALLBACK_SKIN_ID);
      setSkinPreferenceStatus('guest');
      return;
    }
    setActiveSkin(id);
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, id);
    } catch {
      // Private-mode browsers can refuse storage; the in-memory choice still applies.
    }
    setSkinPreferenceStatus('saving');
    void api.put<{ preference: { skin_id: string } }>('/me/preferences/skin', { skin_id: id })
      .then(() => setSkinPreferenceStatus('saved'))
      .catch(() => setSkinPreferenceStatus('error'));
  }

  function chooseSkin(id: string | null): string {
    const allowed = site.skins.length > 0 ? site.skins : FALLBACK_SITE.skins;
    const requested = id && allowed.some(skin => skin.id === id) ? id : null;
    const chosen = requested ?? (allowed.some(skin => skin.id === site.default_skin) ? site.default_skin : allowed[0]!.id);
    setActiveSkin(chosen);
    return chosen;
  }

  async function loadForumContent() {
    try { const d = await api.get<{ items: Board[] }>('/boards'); setBoards(d.items); } catch { setBoards([]); }
    try {
      const d = await api.get<{ items: Thread[]; next_cursor: string | null }>('/feed?limit=20');
      setFeed(d.items); setFeedCursor(d.next_cursor);
    } catch (e) { setError((e as Error).message); }
    try { const d = await api.get<{ items: Announcement[] }>('/announcements'); setAnnouncements(d.items); } catch { setAnnouncements([]); }
  }

  async function loadBase() {
    let config: SiteConfig & { skin_registry?: SkinDescriptor[] } = FALLBACK_SITE;
    try {
      config = await api.get<SiteConfig & { skin_registry: SkinDescriptor[] }>('/site/config');
      setSite(config);
    } catch {
      setSite(FALLBACK_SITE);
    }

    /**
     * Resolve the layout in this order:
     *   1. the member's account preference (follows them across devices);
     *   2. this browser's last choice (guests, and offline/failed API);
     *   3. the deployment default.
     * A guest short-circuits at step 2 so the public page never waits on auth.
     */
    let user: User | null = null;
    try { const d = await api.get<{ user: User }>('/me'); user = d.user; setMe(d.user); } catch { setMe(null); }

    const allowed = config.skins.length > 0 ? config.skins : FALLBACK_SITE.skins;
    const pickAllowed = (id: string | null | undefined): string | null =>
      id && allowed.some(skin => skin.id === id) ? id : null;

    const browserChoice = pickAllowed(readSavedSkin());
    let accountChoice: string | null = null;
    if (user) {
      try {
        const d = await api.get<{ preferences: UserPreferences }>('/me/preferences');
        accountChoice = pickAllowed(d.preferences.skin_id);
        setSkinPreferenceStatus(d.preferences.skin_id ? 'saved' : 'idle');
      } catch {
        setSkinPreferenceStatus('error');
      }
    } else {
      setSkinPreferenceStatus('guest');
    }
    if (user) chooseSkin(accountChoice ?? browserChoice);
    else setActiveSkin(FALLBACK_SKIN_ID);

    // Mirror a browser-only choice into the account the first time a member
    // signs in on a device, so the two do not silently disagree.
    if (user && !accountChoice && browserChoice) {
      void api.put('/me/preferences/skin', { skin_id: browserChoice })
        .then(() => setSkinPreferenceStatus('saved'))
        .catch(() => setSkinPreferenceStatus('error'));
    }
    if (user) await loadProfile(user);
    else {
      setProfile(null);
      setProfileForm({ nickname: '', avatar_data_url: null });
    }
    if (user || config.guest_read_enabled) await loadForumContent();
    else {
      setBoards([]); setFeed([]); setFeedCursor(null); setAnnouncements([]);
    }
    try {
      const d = await api.get<Provider>('/auth/providers');
      setProviders(d);
    } catch { setProviders({ microsoft: false, github: false }); }
  }

  async function loadMoreFeed() {
    if (!feedCursor || feedBusy) return;
    setFeedBusy(true);
    try {
      const d = await api.get<{ items: Thread[]; next_cursor: string | null }>(`/feed?limit=20&cursor=${encodeURIComponent(feedCursor)}`);
      setFeed(current => [...current, ...d.items]); setFeedCursor(d.next_cursor);
    } catch (e) { setError((e as Error).message); }
    finally { setFeedBusy(false); }
  }

  async function loadBookmarks() {
    try { const d = await api.get<{ items: Thread[] }>('/bookmarks'); setBookmarks(d.items); }
    catch (e) { setError((e as Error).message); }
  }

  async function searchForum(query: string) {
    setSearchQuery(query);
    const requestId = ++searchRequestId.current;
    setSearchResults(null);
    setSearchResultQuery(null);
    if (!query.trim()) { setSearchBusy(false); setView({ name: 'search' }); return; }
    setSearchBusy(true);
    setView({ name: 'search' });
    try {
      const results = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
      if (requestId === searchRequestId.current) {
        setSearchResults(results);
        setSearchResultQuery(query.trim());
        setSearchBusy(false);
        setError('');
      }
    } catch (e) {
      if (requestId === searchRequestId.current) { setSearchBusy(false); setError((e as Error).message); }
    }
  }

  async function toggleBookmark(threadId: string, bookmarked: boolean) {
    if (!me) { setView({ name: 'settings' }); return; }
    try {
      if (bookmarked) await api.del(`/threads/${threadId}/bookmark`);
      else await api.put(`/threads/${threadId}/bookmark`);
      await loadBookmarks();
      setSuccess(bookmarked ? '已取消收藏' : '已加入书签');
    } catch (e) { setError((e as Error).message); }
  }

  async function likeThread(threadId: string) {
    if (!me) { setView({ name: 'settings' }); return; }
    try {
      const visibleThread = [
        ...feed,
        ...threads,
        ...bookmarks,
        ...(searchResults?.threads ?? []),
        ...(view.name === 'thread' ? [view.thread] : [])
      ].find(thread => thread.id === threadId);
      const wasLiked = visibleThread?.liked_by_me ?? false;
      const result = wasLiked
        ? await api.del<{ likes: number; liked: boolean }>(`/reactions?target_type=thread&target_id=${encodeURIComponent(threadId)}`)
        : await api.put<{ likes: number; liked: boolean }>('/reactions', { target_type: 'thread', target_id: threadId, reaction: 'like' });
      const update = (thread: Thread): Thread => thread.id === threadId
        ? { ...thread, like_count: result.likes, liked_by_me: result.liked }
        : thread;
      setFeed(current => current.map(update));
      setThreads(current => current.map(update));
      setBookmarks(current => current.map(update));
      setSearchResults(current => current ? { ...current, threads: current.threads.map(update) } : current);
      setView(current => current.name === 'thread' && current.thread.id === threadId
        ? { ...current, thread: update(current.thread) }
        : current);
    }
    catch (e) { setError((e as Error).message); }
  }

  async function loadConversations() {
    try {
      const page = await api.get<{ items: ChatConversation[] }>('/conversations?limit=50');
      setConversations(page.items);
      setActiveConversation(current => {
        if (!current) return current;
        const updated = page.items.find(item => item.id === current.id);
        return updated ? { ...current, ...updated, members: current.members } : current;
      });
    } catch (e) { setError((e as Error).message); }
  }

  async function markConversationRead(conversationId: string, messageId: string) {
    const result = await api.post<{ item: ChatConversation }>(`/conversations/${conversationId}/read`, { message_id: messageId });
    setConversations(current => current.map(item => item.id === conversationId ? result.item : item));
    setActiveConversation(current => current?.id === conversationId
      ? { ...current, ...result.item, members: current.members }
      : current);
  }

  async function openConversation(conversation: ChatConversation) {
    setActiveConversation(conversation);
    setChatMessages([]);
    setChatNextCursor(null);
    setChatBusy(true);
    try {
      const [detail, page] = await Promise.all([
        api.get<{ item: ChatConversation }>(`/conversations/${conversation.id}`),
        api.get<{
          items: ChatMessage[];
          next_cursor: string | null;
          latest_message_id: string | null;
        }>(`/conversations/${conversation.id}/messages?limit=50`)
      ]);
      setActiveConversation(detail.item);
      setChatMessages([...page.items].reverse());
      setChatNextCursor(page.next_cursor);
      if (page.latest_message_id) await markConversationRead(conversation.id, page.latest_message_id);
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setChatBusy(false); }
  }

  async function startDirectMessage(userId: string) {
    setChatBusy(true);
    try {
      const result = await api.post<{ item: ChatConversation }>('/conversations/direct', { user_id: userId });
      await loadConversations();
      await openConversation(result.item);
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setChatBusy(false); }
  }

  function closeConversation() {
    setActiveConversation(null);
    setChatMessages([]);
    setChatNextCursor(null);
    setChatDraft('');
  }

  async function loadOlderMessages() {
    if (!activeConversation || !chatNextCursor || chatBusy) return;
    setChatBusy(true);
    try {
      const page = await api.get<{ items: ChatMessage[]; next_cursor: string | null }>(
        `/conversations/${activeConversation.id}/messages?limit=50&before=${encodeURIComponent(chatNextCursor)}`
      );
      setChatMessages(current => {
        const known = new Set(current.map(item => item.id));
        return [...page.items.reverse().filter(item => !known.has(item.id)), ...current];
      });
      setChatNextCursor(page.next_cursor);
    } catch (e) { setError((e as Error).message); }
    finally { setChatBusy(false); }
  }

  async function sendChatMessage(event: React.FormEvent) {
    event.preventDefault();
    const content = chatDraft.trim();
    if (!activeConversation || !content || chatSending) return;
    setChatSending(true);
    try {
      const result = await api.post<{ item: ChatMessage }>(`/conversations/${activeConversation.id}/messages`, {
        client_id: createClientId(),
        content
      });
      setChatMessages(current => current.some(item => item.id === result.item.id) ? current : [...current, result.item]);
      setChatDraft('');
      await loadConversations();
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setChatSending(false); }
  }

  async function deleteChatMessage(messageId: string) {
    if (!window.confirm('删除这条消息？删除后会保留审计占位。')) return;
    try {
      const result = await api.del<{ item: Partial<ChatMessage> }>(`/messages/${messageId}`);
      setChatMessages(current => current.map(item => item.id === messageId
        ? { ...item, ...result.item, status: 'deleted', content_markdown: '该消息已删除', content_html: '<p>该消息已删除</p>' }
        : item));
      await loadConversations();
    } catch (e) { setError((e as Error).message); }
  }

  async function reportChatMessage(messageId: string) {
    const reason = window.prompt('举报原因（如：辱骂、隐私、广告等）');
    if (!reason) return;
    const details = window.prompt('补充说明（可选）') ?? '';
    try {
      await api.post('/reports', { target_type: 'message', target_id: messageId, reason, details });
      setSuccess('举报已提交，监管者会查看该消息附近的有限上下文');
      setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function toggleChatBlock(userId: string, blocked: boolean) {
    try {
      if (blocked) await api.del(`/users/${userId}/block`);
      else await api.post(`/users/${userId}/block`, {});
      const nextBlocked = !blocked;
      setConversations(current => current.map(item => item.counterpart?.id === userId
        ? { ...item, blocked_by_me: nextBlocked }
        : item));
      setActiveConversation(current => current?.counterpart?.id === userId
        ? { ...current, blocked_by_me: nextBlocked }
        : current);
      setSuccess(nextBlocked ? '已屏蔽该用户' : '已取消屏蔽');
      setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function searchChatUsers(query: string): Promise<ChatUser[]> {
    const value = query.trim();
    if (!value) return [];
    try {
      const result = await api.get<{ items: ChatUser[] }>(`/chat/users?q=${encodeURIComponent(value)}`);
      return result.items;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }

  async function createGroup(input: { name: string; description: string; member_ids: string[] }): Promise<boolean> {
    setChatBusy(true);
    try {
      const result = await api.post<{ item: ChatConversation }>('/groups', input);
      await loadConversations();
      await openConversation(result.item);
      setSuccess('群聊已创建');
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally { setChatBusy(false); }
  }

  async function updateGroup(input: { name: string; description: string; announcement: string }): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    try {
      const result = await api.patch<{ item: ChatConversation }>(`/groups/${activeConversation.id}`, input);
      setActiveConversation(result.item);
      setConversations(current => current.map(item => item.id === result.item.id ? { ...item, ...result.item } : item));
      setSuccess('群资料已更新');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  function applyGroupMembers(members: GroupMember[]) {
    setActiveConversation(current => current ? { ...current, members } : current);
  }

  async function addGroupMembers(userIds: string[]): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    try {
      const result = await api.post<{ members: GroupMember[] }>(`/groups/${activeConversation.id}/members`, { user_ids: userIds });
      applyGroupMembers(result.members);
      setSuccess('成员已加入群聊');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  async function removeGroupMember(userId: string): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    if (!window.confirm('将该成员移出群聊？')) return false;
    try {
      const result = await api.del<{ members: GroupMember[] }>(`/groups/${activeConversation.id}/members/${userId}`);
      applyGroupMembers(result.members);
      setSuccess('成员已移出群聊');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  async function setGroupMemberRole(userId: string, role: 'admin' | 'member'): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    try {
      const result = await api.patch<{ members: GroupMember[] }>(`/groups/${activeConversation.id}/members/${userId}`, { role });
      applyGroupMembers(result.members);
      setSuccess(role === 'admin' ? '已设为群管理员' : '已取消群管理员');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  async function updateMyGroupNickname(nickname: string): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group' || !me) return false;
    try {
      const result = await api.patch<{ members: GroupMember[] }>(`/groups/${activeConversation.id}/members/${me.id}`, { group_nickname: nickname });
      applyGroupMembers(result.members);
      setActiveConversation(current => current?.member ? { ...current, member: { ...current.member, group_nickname: nickname.trim() || null } } : current);
      setSuccess('我的群昵称已更新');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  async function transferGroupOwnership(userId: string): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    if (!window.confirm('确认转让群主？转让后你将成为群管理员。')) return false;
    try {
      const result = await api.post<{ item: ChatConversation }>(`/groups/${activeConversation.id}/transfer`, { user_id: userId });
      setActiveConversation(result.item);
      setConversations(current => current.map(item => item.id === result.item.id ? { ...item, ...result.item } : item));
      setSuccess('群主已转让');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  async function leaveGroup(): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    if (!window.confirm('确认退出该群聊？退出后将无法查看群消息。')) return false;
    try {
      await api.del(`/conversations/${activeConversation.id}/membership`);
      closeConversation();
      await loadConversations();
      setSuccess('已退出群聊');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  async function dissolveGroup(): Promise<boolean> {
    if (!activeConversation || activeConversation.type !== 'group') return false;
    if (!window.confirm(`确认解散“${activeConversation.title}”？此操作会关闭所有成员的群聊。`)) return false;
    try {
      await api.del(`/groups/${activeConversation.id}`);
      closeConversation();
      await loadConversations();
      setSuccess('群聊已解散');
      setError('');
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }

  const activeBoard = view.name === 'board' ? view.board : null;
  const activeThread = view.name === 'thread' ? view.thread : null;

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
      await loadProfile(d.user);
      await adoptAccountSkin();
      await loadForumContent();
    } catch (e) { setError((e as Error).message); }
  }

  async function logout() {
    await api.post('/logout').catch(() => undefined);
    setMe(null); setView({ name: 'home' }); setSuccess(''); setError('');
    setProfile(null); setProfileForm({ nickname: '', avatar_data_url: null });
    setActiveSkin(FALLBACK_SKIN_ID);
    if (!site.guest_read_enabled) {
      setBoards([]); setFeed([]); setFeedCursor(null); setAnnouncements([]);
    }
    try { window.localStorage.removeItem(SKIN_STORAGE_KEY); } catch { /* storage may be unavailable */ }
    setSkinPreferenceStatus('guest');
  }

  async function loadProfile(user: User) {
    try {
      const d = await api.get<{ profile: UserProfile }>('/me/profile');
      setProfile(d.profile);
      setProfileForm({ nickname: d.profile.nickname, avatar_data_url: d.profile.avatar_data_url });
    } catch {
      const fallback = { nickname: user.real_name, avatar_data_url: null, updated_at: user.updated_at };
      setProfile(fallback);
      setProfileForm({ nickname: fallback.nickname, avatar_data_url: null });
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    try {
      const d = await api.patch<{ profile: UserProfile }>('/me/profile', profileForm);
      setProfile(d.profile);
      setProfileForm({ nickname: d.profile.nickname, avatar_data_url: d.profile.avatar_data_url });
      setSuccess('个人资料已保存'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post('/register', regForm);
      setRegForm({ invitation_code: '', student_number: '', password: '', real_name: '', nickname: '', avatar_data_url: null });
      setSuccess('注册申请已提交，请等待管理员激活后再登录');
      setView({ name: 'profile' }); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function createThread(event: React.FormEvent) {
    event.preventDefault();
    const slug = activeBoard?.slug ?? composeBoard;
    if (!slug) { setError('请先选择社区空间'); return; }
    try {
      await api.post(`/boards/${slug}/threads`, { title: newTitle, content: newContent });
      if (activeBoard) {
        const d = await api.get<{ items: Thread[] }>(`/boards/${slug}/threads?limit=50`);
        setThreads(d.items);
      }
      const page = await api.get<{ items: Thread[]; next_cursor: string | null }>('/feed?limit=20');
      setFeed(page.items); setFeedCursor(page.next_cursor);
      setNewTitle(''); setNewContent(''); setSuccess('话题已发布'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function createReply(event: React.FormEvent) {
    event.preventDefault();
    if (!activeThread) return;
    try {
      await api.post(`/threads/${activeThread.id}/posts`, { content: reply });
      const d = await api.get<{ item: Thread; posts: Post[] }>(`/threads/${activeThread.id}`);
      setPosts(d.posts); setView({ name: 'thread', thread: d.item }); setReply(''); setSuccess('回复已发送'); setError('');
      const page = await api.get<{ items: Thread[]; next_cursor: string | null }>('/feed?limit=20');
      setFeed(page.items); setFeedCursor(page.next_cursor);
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteThread(threadId: string) {
    if (!window.confirm('删除这条动态？动态正文和全部评论都会被删除。')) return;
    try {
      await api.del(`/threads/${threadId}`);
      const keep = (thread: Thread) => thread.id !== threadId;
      setFeed(current => current.filter(keep));
      setThreads(current => current.filter(keep));
      setBookmarks(current => current.filter(keep));
      setSearchResults(current => current ? { ...current, threads: current.threads.filter(keep) } : current);
      setView(current => current.name === 'thread' && current.thread.id === threadId ? { name: 'home' } : current);
      setPosts([]);
      setSuccess('动态已删除'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function deletePost(postId: string) {
    if (!window.confirm('删除这条评论？此操作会从讨论中移除评论。')) return;
    try {
      const result = await api.del<{ success: boolean; thread_id: string; reply_count: number }>(`/posts/${postId}`);
      setPosts(current => current.filter(post => post.id !== postId));
      const update = (thread: Thread): Thread => thread.id === result.thread_id
        ? { ...thread, reply_count: result.reply_count }
        : thread;
      setFeed(current => current.map(update));
      setThreads(current => current.map(update));
      setBookmarks(current => current.map(update));
      setSearchResults(current => current ? { ...current, threads: current.threads.map(update) } : current);
      setView(current => current.name === 'thread' && current.thread.id === result.thread_id
        ? { ...current, thread: update(current.thread) }
        : current);
      setSuccess('评论已删除'); setError('');
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
      if (tab === 'reports') { const d = await api.get<{ items: ReportItem[] }>('/reports'); setAdminReports(d.items); }
      if (tab === 'invitations') { const d = await api.get<{ items: InvitationItem[] }>('/invitations'); setAdminInvitations(d.items); }
      if (tab === 'appearance') {
        const d = await api.get<{ config: AdminSiteConfig }>('/admin/site-config');
        setSiteConfig(d.config);
      }
      if (tab === 'settings') {
        const d = await api.get<{ settings: RuntimeSettings }>('/admin/settings');
        setSettings(d.settings);
        setSettingsForm(f => ({
          ...f, forum_name: d.settings.forum_name, public_origin: d.settings.public_origin,
          session_ttl_seconds: d.settings.session_ttl_seconds, cookie_secure: d.settings.cookie_secure,
          cookie_samesite: d.settings.cookie_samesite, trust_proxy_headers: d.settings.trust_proxy_headers,
          github_client_id: d.settings.github_client_id, github_client_secret: '', github_redirect_uri: d.settings.github_redirect_uri,
          clear_github_client_secret: false, microsoft_client_id: d.settings.microsoft_client_id,
          microsoft_client_secret: '', microsoft_redirect_uri: d.settings.microsoft_redirect_uri,
          clear_microsoft_client_secret: false, confirm_password: ''
        }));
      }
    } catch (e) { setError((e as Error).message); }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    try {
      const body = {
        ...settingsForm,
        github_client_secret: settingsForm.github_client_secret || undefined,
        microsoft_client_secret: settingsForm.microsoft_client_secret || undefined
      };
      const d = await api.patch<{ settings: RuntimeSettings; changed_fields: string[] }>('/admin/settings', body);
      setSettings(d.settings);
      setSettingsForm(f => ({ ...f, github_client_secret: '', microsoft_client_secret: '', confirm_password: '' }));
      const prov = await api.get<Provider>('/auth/providers');
      setProviders(prov);
      setSuccess('高级设置已保存并立即生效'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function saveSiteConfig(event: React.FormEvent) {
    event.preventDefault();
    if (!siteConfig) return;
    try {
      const d = await api.patch<{ config: AdminSiteConfig; changed_fields: string[] }>('/admin/site-config', {
        default_skin: siteConfig.default_skin,
        allowed_skins: siteConfig.skins.map(skin => skin.id),
        guest_read_enabled: siteConfig.guest_read_enabled,
        registration_enabled: siteConfig.registration_enabled,
        site_tagline: siteConfig.tagline
      });
      setSiteConfig(d.config);
      setSite(previous => ({ ...previous, ...d.config }));
      setSuccess('站点外观设置已保存并立即生效'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function runDiagnostics() {
    setDiagnosticsBusy(true);
    try {
      const d = await api.get<Diagnostics>('/admin/diagnostics');
      setDiagnostics(d);
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setDiagnosticsBusy(false); }
  }

  function resetSettingsPassword() {
    setSettingsForm(f => ({ ...f, confirm_password: '', github_client_secret: '', microsoft_client_secret: '',
      clear_github_client_secret: false, clear_microsoft_client_secret: false }));
  }

  async function loadNotifications() {
    try { const d = await api.get<{ items: NotificationItem[] }>('/notifications'); setNotifications(d.items); } catch { setNotifications([]); }
  }

  async function markAllNotificationsRead() {
    try { await api.post('/notifications/read-all'); await loadNotifications(); } catch (e) { setError((e as Error).message); }
  }

  async function markNotificationRead(id: string) {
    try { await api.post(`/notifications/${id}/read`); await loadNotifications(); } catch (e) { setError((e as Error).message); }
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

  async function createInvitation(role: InvitationRole = 'member') {
    try { const d = await api.post<{ item: InvitationItem }>('/invitations', { ttl_hours: 168, role }); await loadAdmin('invitations'); setSuccess(`邀请码已创建：${d.item.code}`); } catch (e) { setError((e as Error).message); }
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
  const chatUnreadCount = useMemo(() => conversations.reduce((sum, item) => sum + item.unread_count, 0), [conversations]);

  const forum: SkinContext = {
    site: {
      forum_name: site.forum_name,
      tagline: site.tagline,
      version: site.version,
      skins: site.skins,
      active_skin: activeSkin,
      default_skin: site.default_skin,
      api_origin: API_ORIGIN,
      guest_read_enabled: site.guest_read_enabled,
      registration_enabled: site.registration_enabled,
      setSkin: applySkinChoice,
      skin_preference_status: me ? skinPreferenceStatus : 'guest',
      skin_sync_available: Boolean(me)
    },
    session: { me, providers, isStaff, isAdmin, isOwner },
    data: {
      boards, threads, feed, feedCursor, feedBusy, bookmarks, searchResults, searchResultQuery, searchBusy,
      posts, announcements, notifications,
      conversations, activeConversation, chatMessages, chatNextCursor, chatBusy, chatSending, chatUnreadCount,
      totalReplies,
      adminUsers, adminReports, adminInvitations, pendingCount, openReports, unusedInvitations,
      announcementAnchorId: ANNOUNCEMENT_ANCHOR
    },
    forms: {
      username, setUsername, password, setPassword, regForm, setRegForm,
      profile, profileForm, setProfileForm,
      reply, setReply, newTitle, setNewTitle, newContent, setNewContent,
      composeBoard, setComposeBoard, searchQuery, setSearchQuery, chatDraft, setChatDraft,
      announcementForm, setAnnouncementForm, newBoardForm, setNewBoardForm,
      settings, settingsForm, setSettingsForm, siteConfig, setSiteConfig,
      diagnostics, diagnosticsBusy
    },
    messages: {
      error, success, setError, setSuccess,
      clearMessages: () => { setError(''); setSuccess(''); }
    },
    actions: {
      reloadBase: loadBase, loadMoreFeed, loadBookmarks, searchForum, toggleBookmark, likeThread,
      loadConversations, searchChatUsers, createGroup, updateGroup, addGroupMembers, removeGroupMember,
      setGroupMemberRole, updateMyGroupNickname, transferGroupOwnership, leaveGroup, dissolveGroup,
      startDirectMessage, openConversation, closeConversation,
      loadOlderMessages, sendChatMessage, deleteChatMessage, reportChatMessage, toggleChatBlock,
      openThread, loadNotifications, login, logout, register, saveProfile,
      createThread, createReply, deleteThread, deletePost, submitReport, loadAdmin, saveSettings, saveSiteConfig,
      runDiagnostics, resetSettingsPassword, activateUser, setUserStatus,
      resolveReport, rejectReport, createInvitation, createAnnouncement, createBoard,
      markAllNotificationsRead, markNotificationRead,
      saveSkinPreference: async (id: string) => { applySkinChoice(id); }
    },
    view,
    setView,
    helpers: { formatDate },
    ui: { roleLabel: ROLE_LABEL, levelLabel: LEVEL_LABEL, adminTabs: ADMIN_TABS }
  };

  const skin = resolveSkin(activeSkin);
  const Skin = skin.component;

  if (view.name === 'admin' && isAdmin && me) {
    return <AdminConsole me={me} site={site} initialTab={view.tab as AdminSection} onExit={() => setView({ name: 'home' })} onSettingsChanged={loadBase} />;
  }

  if (showSplash) return <div className="wfla-splash" aria-label="World Foreign Language Academy">
    <div className="wfla-splash-content">
      <div className="wfla-name" aria-hidden="true">
        <span className="wfla-word" style={{ '--rest': '4.25em' } as React.CSSProperties}><b>W</b><span>orld</span></span>
        <span className="wfla-word" style={{ '--rest': '4.85em' } as React.CSSProperties}><b>F</b><span>oreign</span></span>
        <span className="wfla-word" style={{ '--rest': '6.6em' } as React.CSSProperties}><b>L</b><span>anguage</span></span>
        <span className="wfla-word" style={{ '--rest': '5.9em' } as React.CSSProperties}><b>A</b><span>cademy</span></span>
      </div>
      <p>WFLA COMMUNITY</p>
    </div>
  </div>;

  return (
    <SkinErrorBoundary>
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>正在加载界面…</div>}>
        <Skin forum={forum} />
      </Suspense>
    </SkinErrorBoundary>
  );
}
