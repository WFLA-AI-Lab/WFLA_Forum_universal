import type { Env } from '../../env';
import { nowIso } from '../../core/utils';

export const SETTING_ENV_MAP = {
  forum_name: 'FORUM_NAME',
  public_origin: 'FRONTEND_ORIGIN',
  session_ttl_seconds: 'SESSION_TTL_SECONDS',
  cookie_secure: 'COOKIE_SECURE',
  cookie_samesite: 'COOKIE_SAMESITE',
  trust_proxy_headers: 'TRUST_PROXY_HEADERS',
  github_client_id: 'GITHUB_CLIENT_ID',
  github_client_secret: 'GITHUB_CLIENT_SECRET',
  github_redirect_uri: 'GITHUB_REDIRECT_URI',
  microsoft_client_id: 'MS_CLIENT_ID',
  microsoft_client_secret: 'MS_CLIENT_SECRET',
  microsoft_redirect_uri: 'MS_REDIRECT_URI'
} as const;

export type SettingKey = keyof typeof SETTING_ENV_MAP;
export type SecretSettingKey = 'github_client_secret' | 'microsoft_client_secret';
export const SETTING_KEYS = Object.keys(SETTING_ENV_MAP) as SettingKey[];
export const SECRET_SETTING_KEYS: readonly SecretSettingKey[] = ['github_client_secret', 'microsoft_client_secret'];

interface SettingRow {
  key: string;
  value: string;
  is_secret: number;
  updated_at: string;
}

interface EncryptedEnvelope {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

export interface PublicSettings {
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isSecretKey(key: SettingKey): key is SecretSettingKey {
  return SECRET_SETTING_KEYS.includes(key as SecretSettingKey);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSetting(env: Env, key: SecretSettingKey, plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKey(env.AUTH_SESSION_SECRET, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`setting:${key}`) },
    aesKey,
    encoder.encode(plaintext)
  );
  const envelope: EncryptedEnvelope = {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted))
  };
  return JSON.stringify(envelope);
}

export async function decryptSetting(env: Env, key: SecretSettingKey, stored: string): Promise<string> {
  if (!stored) return '';
  const envelope = JSON.parse(stored) as Partial<EncryptedEnvelope>;
  if (envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.data) {
    throw new Error('Unsupported encrypted setting format');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const aesKey = await deriveKey(env.AUTH_SESSION_SECRET, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`setting:${key}`) },
    aesKey,
    base64ToBytes(envelope.data)
  );
  return decoder.decode(decrypted);
}

function applySetting(env: Env, key: SettingKey, value: string): void {
  const target = env as unknown as Record<string, unknown>;
  const envName = SETTING_ENV_MAP[key];
  if (key === 'cookie_secure' || key === 'trust_proxy_headers') {
    target[envName] = /^(1|true|yes|on)$/i.test(value);
    return;
  }
  if (key === 'cookie_samesite') {
    target[envName] = value === 'Strict' ? 'Strict' : 'Lax';
    return;
  }
  target[envName] = value;
}

export async function applyStoredSettings(env: Env): Promise<void> {
  let rows: SettingRow[];
  try {
    const result = await env.DB.prepare(
      'SELECT key, value, is_secret, updated_at FROM app_settings ORDER BY key'
    ).all<SettingRow>();
    rows = result.results ?? [];
  } catch (error) {
    // A database that has not run migration 0006 yet keeps using .env values.
    console.warn('[wfla] app_settings unavailable; using environment defaults');
    if (error instanceof Error) console.warn(`[wfla] ${error.message}`);
    return;
  }

  for (const row of rows) {
    if (!SETTING_KEYS.includes(row.key as SettingKey)) continue;
    const key = row.key as SettingKey;
    try {
      const value = isSecretKey(key) ? await decryptSetting(env, key, row.value) : row.value;
      applySetting(env, key, value);
    } catch (error) {
      console.error(`[wfla] failed to load setting ${key}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}

export async function readPublicSettings(env: Env): Promise<PublicSettings> {
  let updatedAt: string | null;
  try {
    const row = await env.DB.prepare('SELECT MAX(updated_at) AS updated_at FROM app_settings')
      .first<{ updated_at: string | null }>();
    updatedAt = row?.updated_at ?? null;
  } catch {
    updatedAt = null;
  }

  return {
    forum_name: env.FORUM_NAME ?? '世外墙 WFLA Wall',
    public_origin: env.FRONTEND_ORIGIN ?? 'https://forum.example.com',
    session_ttl_seconds: Number(env.SESSION_TTL_SECONDS ?? 604800),
    cookie_secure: env.COOKIE_SECURE ?? String(env.FRONTEND_ORIGIN ?? '').startsWith('https://'),
    cookie_samesite: env.COOKIE_SAMESITE ?? 'Lax',
    trust_proxy_headers: env.TRUST_PROXY_HEADERS ?? false,
    github_client_id: env.GITHUB_CLIENT_ID ?? '',
    github_client_secret_configured: Boolean(env.GITHUB_CLIENT_SECRET),
    github_redirect_uri: env.GITHUB_REDIRECT_URI ?? '',
    microsoft_client_id: env.MS_CLIENT_ID ?? '',
    microsoft_client_secret_configured: Boolean(env.MS_CLIENT_SECRET),
    microsoft_redirect_uri: env.MS_REDIRECT_URI ?? '',
    updated_at: updatedAt
  };
}

export interface PreparedSettingUpdate {
  key: SettingKey;
  value: string;
  isSecret: boolean;
  plainValue?: string;
}

export async function prepareSettingUpdate(
  env: Env,
  key: SettingKey,
  value: string | boolean | number | null
): Promise<PreparedSettingUpdate> {
  if (isSecretKey(key)) {
    const plaintext = value === null ? '' : String(value);
    return { key, value: await encryptSetting(env, key, plaintext), isSecret: true, plainValue: plaintext };
  }
  return { key, value: String(value), isSecret: false, plainValue: String(value) };
}

export async function persistSettingUpdates(
  env: Env,
  updates: PreparedSettingUpdate[],
  actorId: string
): Promise<void> {
  const timestamp = nowIso();
  const statements = updates.map(update => env.DB.prepare(
    `INSERT INTO app_settings (key, value, is_secret, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(update.key, update.value, update.isSecret ? 1 : 0, actorId, timestamp));
  await env.DB.batch(statements);
}

export function applyPreparedSettings(env: Env, updates: PreparedSettingUpdate[]): void {
  for (const update of updates) {
    if (update.plainValue !== undefined) applySetting(env, update.key, update.plainValue);
  }
}