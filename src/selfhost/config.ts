import type { Env } from '../env';
import { loadDotEnv } from './dotenv';

export interface SelfHostConfig {
  port: number;
  host: string;
  dbPath: string;
  frontendDir: string;
  environment: string;
  forumName: string;
  sessionTtlSeconds: string;
  publicOrigin: string;
  authSessionSecret: string;
  cookieSecure: boolean;
  cookieSameSite: 'Lax' | 'Strict';
  trustProxyHeaders: boolean;
  msClientId: string | undefined;
  msClientSecret: string | undefined;
  msRedirectUri: string | undefined;
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function required(name: string): string {
  const value = envValue(name);
  if (!value) throw new Error(`缺少环境变量 ${name}，请复制 .env.selfhost.example 为 .env 并填写`);
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

loadDotEnv();

export function loadConfig(): SelfHostConfig {
  const environment = envValue('ENVIRONMENT') ?? 'production';
  const publicOrigin = (envValue('PUBLIC_ORIGIN') ?? envValue('FRONTEND_ORIGIN') ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/i.test(publicOrigin)) {
    throw new Error('PUBLIC_ORIGIN 必须是完整地址，例如 http://192.168.1.10:8787 或 https://forum.example.com');
  }
  const url = new URL(publicOrigin);
  const cookieSecure = parseBoolean(envValue('COOKIE_SECURE'), url.protocol === 'https:');
  const cookieSameSite = envValue('COOKIE_SAMESITE') === 'Strict' ? 'Strict' : 'Lax';
  return {
    port: Number(envValue('PORT') ?? 8787),
    host: envValue('HOST') ?? '0.0.0.0',
    dbPath: envValue('WFLA_DB_PATH') ?? 'data/wfla-wall.sqlite',
    frontendDir: envValue('WFLA_FRONTEND_DIR') ?? 'public',
    environment,
    forumName: envValue('FORUM_NAME') ?? '世外墙 WFLA Wall',
    sessionTtlSeconds: envValue('SESSION_TTL_SECONDS') ?? '604800',
    publicOrigin,
    authSessionSecret: required('AUTH_SESSION_SECRET'),
    cookieSecure,
    cookieSameSite,
    trustProxyHeaders: parseBoolean(envValue('TRUST_PROXY_HEADERS'), false),
    msClientId: envValue('MS_CLIENT_ID'),
    msClientSecret: envValue('MS_CLIENT_SECRET'),
    msRedirectUri: envValue('MS_REDIRECT_URI')
  };
}

export function toEnv(config: SelfHostConfig, db: D1Database): Env {
  return {
    DB: db,
    AUTH_SESSION_SECRET: config.authSessionSecret,
    ENVIRONMENT: config.environment,
    FORUM_NAME: config.forumName,
    SESSION_TTL_SECONDS: config.sessionTtlSeconds,
    FRONTEND_ORIGIN: config.publicOrigin,
    COOKIE_SECURE: config.cookieSecure,
    COOKIE_SAMESITE: config.cookieSameSite,
    TRUST_PROXY_HEADERS: config.trustProxyHeaders,
    ...(config.msClientId ? { MS_CLIENT_ID: config.msClientId } : {}),
    ...(config.msClientSecret ? { MS_CLIENT_SECRET: config.msClientSecret } : {}),
    ...(config.msRedirectUri ? { MS_REDIRECT_URI: config.msRedirectUri } : {})
  };
}