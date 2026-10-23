const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export interface ApiError {
  code: string;
  message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message ?? `请求失败 ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
