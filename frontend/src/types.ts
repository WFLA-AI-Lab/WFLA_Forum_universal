export interface User {
  id: string;
  username: string;
  real_name: string;
  graduation_year: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  status: 'pending' | 'active' | 'muted' | 'banned' | 'deleted';
  created_at: string;
  updated_at: string;
}

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
  last_activity_at: string;
  created_at: string;
  author_id: string;
  author?: { username: string; real_name: string; graduation_year: string; role: string };
}

export interface Post {
  id: string;
  thread_id: string;
  floor_number: number;
  content_markdown: string;
  content_html: string;
  created_at: string;
  author_id: string;
  author?: { username: string; real_name: string; graduation_year: string; role: string };
}

export interface Announcement {
  id: string;
  title: string;
  content_html: string;
  level: 'normal' | 'important' | 'urgent';
  starts_at: string;
  ends_at: string | null;
  author_real_name: string;
  author_graduation_year: string;
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
