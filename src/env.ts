export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  AUTH_SESSION_SECRET: string;
  ENVIRONMENT?: string;
  FORUM_NAME?: string;
  SESSION_TTL_SECONDS?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_REDIRECT_URI?: string;
}

export type Role = 'owner' | 'admin' | 'moderator' | 'member' | 'guest';
export type UserStatus = 'pending' | 'active' | 'muted' | 'banned' | 'deleted';
export type ThreadStatus = 'published' | 'hidden' | 'locked' | 'deleted';
export type PostStatus = 'published' | 'hidden' | 'deleted';
export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'rejected';
export type ReportTargetType = 'thread' | 'post' | 'user';

export interface SessionUser {
  id: string;
  username: string;
  realName: string;
  graduationYear: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthContext {
  user: SessionUser | null;
}

export interface PaginationQuery {
  limit?: number;
  cursor?: string | null;
}
