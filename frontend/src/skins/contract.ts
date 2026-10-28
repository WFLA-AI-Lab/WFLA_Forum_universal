/**
 * ============================================================================
 * WFLA Wall skin contract  (SKIN_CONTRACT_VERSION = 3)
 * ============================================================================
 *
 * A *skin* is a whole frontend layout, not a colour theme. Two skins may
 * rearrange the page completely. Everything they share is this file.
 *
 * How it works (see also docs/FRONTEND_SKIN_GUIDE.md):
 *
 *   1. `App.tsx` owns ALL state, fetching and auth. It is the "container".
 *   2. It builds one `SkinContext` object per render and hands it to the skin.
 *   3. The skin is a pure presentational component: it reads the context and
 *      calls the actions on it. It must not fetch, store tokens, or hold the
 *      source of truth for any server data.
 *
 * Adding a skin:
 *
 *   frontend/src/skins/<id>/<Name>.tsx   -> default-exports a SkinComponent
 *   frontend/src/skins/registry.ts       -> register { id, component }
 *   src/modules/site/skins.ts            -> register the descriptor (server side)
 *
 * Contract rules:
 *   - `SkinContext` is additive-only within a contract version. Add fields
 *     freely; never remove or change the type of an existing one without
 *     bumping SKIN_CONTRACT_VERSION in src/version.ts (and this file).
 *   - A skin must render a usable app for a *guest* (me === null) and for a
 *     signed-in member. The container already handles the data.
 *   - A skin must be keyboard reachable and respect prefers-reduced-motion.
 */

/* ------------------------------------------------------------------ domain */

export interface User {
  id: string;
  username: string;
  real_name: string;
  enrollment_year: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  status: 'pending' | 'active' | 'muted' | 'banned' | 'deleted';
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  nickname: string;
  avatar_data_url: string | null;
  updated_at: string;
}

export type ProfileFormState = Pick<UserProfile, 'nickname' | 'avatar_data_url'>;

export interface Board {
  id: string;
  slug: string;
  name: string;
  description: string;
  position: number;
  is_active: boolean;
}

export interface Thread {
  id: string;
  title: string;
  slug: string;
  status: string;
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  like_count: number;
  liked_by_me: boolean;
  last_activity_at: string;
  created_at: string;
  author_id: string;
  author?: { username: string; real_name: string; enrollment_year: string; role: string; nickname?: string; avatar_data_url?: string | null };
  board?: { slug: string; name: string };
  preview_html?: string | null;
}

export interface SearchResults {
  threads: Thread[];
  posts: { id: string; thread_id: string; thread_title: string }[];
  users: Pick<User, 'id' | 'real_name' | 'enrollment_year' | 'role'>[];
}

export interface Post {
  id: string;
  thread_id: string;
  floor_number: number;
  content_markdown: string;
  content_html: string;
  created_at: string;
  author_id: string;
  author?: { username: string; real_name: string; enrollment_year: string; role: string; nickname?: string; avatar_data_url?: string | null };
}

export type ChatUser = Pick<User, 'id' | 'username' | 'real_name' | 'enrollment_year' | 'role' | 'status'>;

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  content_markdown: string;
  content_html: string;
  status: 'published' | 'deleted';
  created_at: string;
  deleted_at: string | null;
  sender: ChatUser | null;
}

export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  description: string | null;
  counterpart: ChatUser | null;
  owner: ChatUser | null;
  last_message: ChatMessage | null;
  last_message_at: string | null;
  unread_count: number;
  blocked_by_me: boolean;
  blocked_me: boolean;
  member: {
    joined_at: string;
    left_at: string | null;
    last_read_message_id: string | null;
    last_read_at: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content_html: string;
  level: 'normal' | 'important' | 'urgent';
  starts_at: string;
  ends_at: string | null;
  author_real_name: string;
  author_enrollment_year: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  is_read: number;
  created_at: string;
}

export interface ReportItem {
  id: string;
  reporter_id: string;
  reporter_username?: string;
  target_type: 'thread' | 'post' | 'user' | 'message';
  target_id: string;
  reason: string;
  details: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export type InvitationRole = 'member' | 'moderator' | 'admin';

export interface InvitationItem {
  role: InvitationRole;
  id: string;
  code: string;
  created_by: string | null;
  used_by: string | null;
  expires_at: string | null;
  revoked_at?: string | null;
  created_at: string;
}

export interface RuntimeSettings {
  forum_name: string;
  public_origin: string;
  session_ttl_seconds: number;
  cookie_secure: boolean;
  cookie_samesite: 'Lax' | 'Strict';
  trust_proxy_headers: boolean;
  github_client_id: string;
  github_client_secret_configured: boolean;
  github_redirect_uri: string;
  microsoft_client_id: string;
  microsoft_client_secret_configured: boolean;
  microsoft_redirect_uri: string;
  updated_at: string | null;
}

export interface Provider {
  forum_name?: string;
  microsoft: boolean;
  github: boolean;
}

export interface EndpointProbe {
  label: string;
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
}

export interface Diagnostics {
  checked_at: string;
  results: Record<string, EndpointProbe>;
  hint: string | null;
}

/** Remembers the signed-in member's skin choice on their account. */
export interface UserPreferences {
  skin_id: string | null;
  updated_at: string | null;
}

/** Snapshot of where a member's skin preference lives right now. */
export type SkinPreferenceStatus = 'idle' | 'saving' | 'saved' | 'guest' | 'error';
export interface SkinDescriptor {
  id: string;
  name: string;
  description: string;
  status: 'stable' | 'preview';
}

export interface SiteConfig {
  forum_name: string;
  tagline: string;
  version: string;
  api_version: string;
  skin_contract_version: number;
  default_skin: string;
  skins: SkinDescriptor[];
  guest_read_enabled: boolean;
  registration_enabled: boolean;
}

export interface AdminSiteConfig extends SiteConfig {
  all_skins: SkinDescriptor[];
  updated_at: string | null;
}

/* -------------------------------------------------------------------- view */

export type AdminTab = 'users' | 'reports' | 'invitations' | 'announcements' | 'settings' | 'appearance';

export type View =
  | { name: 'home' }
  | { name: 'announcements' }
  | { name: 'community' }
  | { name: 'profile' }
  | { name: 'bookmarks' }
  | { name: 'search' }
  | { name: 'board'; board: Board }
  | { name: 'thread'; thread: Thread }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'notifications' }
  | { name: 'settings' }
  | { name: 'admin'; tab: AdminTab };

/* ----------------------------------------------------------------- context */

/** Branding and skin metadata, already resolved by the container. */
export interface SkinSite {
  forum_name: string;
  tagline: string;
  version: string;
  /** All skins this deployment allows, in server order. */
  skins: SkinDescriptor[];
  /** The skin currently rendering. */
  active_skin: string;
  default_skin: string;
  /** Public origin without a trailing slash, for OAuth link buttons. */
  api_origin: string;
  guest_read_enabled: boolean;
  registration_enabled: boolean;
  /** Switches skin and persists the choice. Safe to call from any skin. */
  setSkin: (id: string) => void;
  /** Where the current choice is stored: the account, or this browser only. */
  skin_preference_status: SkinPreferenceStatus;
  /** True when the visitor has an account and can sync the choice across devices. */
  skin_sync_available: boolean;
}

export interface SkinSession {
  me: User | null;
  providers: Provider;
  isStaff: boolean;
  isAdmin: boolean;
  isOwner: boolean;
}

export interface SkinData {
  boards: Board[];
  feed: Thread[];
  feedCursor: string | null;
  feedBusy: boolean;
  bookmarks: Thread[];
  searchResults: SearchResults | null;
  /** Query that produced searchResults; null before a completed search. */
  searchResultQuery: string | null;
  searchBusy: boolean;
  threads: Thread[];
  posts: Post[];
  announcements: Announcement[];
  notifications: NotificationItem[];
  conversations: ChatConversation[];
  activeConversation: ChatConversation | null;
  chatMessages: ChatMessage[];
  chatNextCursor: string | null;
  chatBusy: boolean;
  chatSending: boolean;
  chatUnreadCount: number;
  /** Total replies across `threads`, pre-computed for stat strips. */
  totalReplies: number;
  adminUsers: User[];
  adminReports: ReportItem[];
  adminInvitations: InvitationItem[];
  pendingCount: number;
  openReports: number;
  unusedInvitations: number;
  /** Anchor id the container wants a skin to scroll to after navigation. */
  announcementAnchorId: string;
}

/** A React state setter, re-exported so skins do not need to import React types. */
export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export type SettingsFormState = {
  forum_name: string;
  public_origin: string;
  session_ttl_seconds: number;
  cookie_secure: boolean;
  cookie_samesite: 'Lax' | 'Strict';
  trust_proxy_headers: boolean;
  github_client_id: string;
  github_client_secret: string;
  github_redirect_uri: string;
  clear_github_client_secret: boolean;
  microsoft_client_id: string;
  microsoft_client_secret: string;
  microsoft_redirect_uri: string;
  clear_microsoft_client_secret: boolean;
  confirm_password: string;
};

export type AnnouncementFormState = { title: string; content: string; level: string; ends_at: string };
export type NewBoardFormState = { name: string; slug: string; description: string };

export type RegisterFormState = {
  invitation_code: string;
  username: string;
  password: string;
  real_name: string;
  enrollment_year: string;
};

export interface SkinForms {
  /* auth */
  username: string;
  setUsername: Setter<string>;
  password: string;
  setPassword: Setter<string>;
  regForm: RegisterFormState;
  setRegForm: Setter<RegisterFormState>;
  profile: UserProfile | null;
  profileForm: ProfileFormState;
  setProfileForm: Setter<ProfileFormState>;
  /* content */
  reply: string;
  setReply: Setter<string>;
  newTitle: string;
  setNewTitle: Setter<string>;
  newContent: string;
  setNewContent: Setter<string>;
  composeBoard: string;
  setComposeBoard: Setter<string>;
  searchQuery: string;
  setSearchQuery: Setter<string>;
  chatDraft: string;
  setChatDraft: Setter<string>;
  /* announcements + boards (admin) */
  announcementForm: AnnouncementFormState;
  setAnnouncementForm: Setter<AnnouncementFormState>;
  newBoardForm: NewBoardFormState;
  setNewBoardForm: Setter<NewBoardFormState>;
  /* advanced settings (owner only) */
  settings: RuntimeSettings | null;
  settingsForm: SettingsFormState;
  setSettingsForm: Setter<SettingsFormState>;
  /** Admin site config (skins / registration policy). */
  siteConfig: AdminSiteConfig | null;
  setSiteConfig: Setter<AdminSiteConfig | null>;
  diagnostics: Diagnostics | null;
  diagnosticsBusy: boolean;
}

/** Rendered messages the container owns; skins just display them. */
export interface SkinMessages {
  error: string;
  success: string;
  setError: Setter<string>;
  setSuccess: Setter<string>;
  clearMessages: () => void;
}

export interface SkinActions {
  reloadBase: () => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  loadBookmarks: () => Promise<void>;
  searchForum: (query: string) => Promise<void>;
  toggleBookmark: (threadId: string, bookmarked: boolean) => Promise<void>;
  likeThread: (threadId: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  startDirectMessage: (userId: string) => Promise<void>;
  openConversation: (conversation: ChatConversation) => Promise<void>;
  closeConversation: () => void;
  loadOlderMessages: () => Promise<void>;
  sendChatMessage: (event: React.FormEvent) => Promise<void>;
  deleteChatMessage: (messageId: string) => Promise<void>;
  reportChatMessage: (messageId: string) => Promise<void>;
  toggleChatBlock: (userId: string, blocked: boolean) => Promise<void>;
  openThread: (id: string) => Promise<void>;
  loadNotifications: () => Promise<void>;
  login: (event: React.FormEvent) => Promise<void>;
  logout: () => Promise<void>;
  register: (event: React.FormEvent) => Promise<void>;
  saveProfile: (event: React.FormEvent) => Promise<void>;
  createThread: (event: React.FormEvent) => Promise<void>;
  createReply: (event: React.FormEvent) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  submitReport: (targetType: 'thread' | 'post' | 'user', targetId: string) => Promise<void>;
  loadAdmin: (tab: AdminTab) => Promise<void>;
  saveSettings: (event: React.FormEvent) => Promise<void>;
  saveSiteConfig: (event: React.FormEvent) => Promise<void>;
  runDiagnostics: () => Promise<void>;
  resetSettingsPassword: () => void;
  activateUser: (id: string) => Promise<void>;
  setUserStatus: (id: string, status: string) => Promise<void>;
  resolveReport: (id: string) => Promise<void>;
  rejectReport: (id: string) => Promise<void>;
  createInvitation: (role?: InvitationRole) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  createAnnouncement: (event: React.FormEvent) => Promise<void>;
  createBoard: (event: React.FormEvent) => Promise<void>;
  /** Persists the signed-in member's skin choice to their account. */
  saveSkinPreference: (id: string) => Promise<void>;
}

/** Everything a skin needs. This is the object you receive as the `forum` prop. */
export interface SkinContext {
  site: SkinSite;
  session: SkinSession;
  data: SkinData;
  forms: SkinForms;
  messages: SkinMessages;
  actions: SkinActions;
  /** Current route within the single-page app. */
  view: View;
  setView: (view: View) => void;
  /** Small helpers the container owns so skins stay consistent. */
  helpers: {
    formatDate: (value: string) => string;
  };
  /**
   * Presentation constants. These are plain labels, not business rules: a skin
   * may lay them out differently, but should keep the wording consistent with
   * the rest of the site.
   */
  ui: {
    roleLabel: Record<string, string>;
    levelLabel: Record<string, string>;
    adminTabs: { key: AdminTab; en: string; zh: string }[];
  };
}

/* ------------------------------------------------------------------ module */

export type SkinComponent = (props: { forum: SkinContext }) => React.ReactElement;

/** What a skin file exports as its default. */
export type SkinModule = { default: SkinComponent };
