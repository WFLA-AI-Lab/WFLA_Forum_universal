import type { ReactNode } from 'react';

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`adm-badge ${tone}`}>{children}</span>;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replaceAll('/', '.');
}

export function Empty({ text }: { text: string }) {
  return <div className="adm-empty"><span>○</span><p>{text}</p></div>;
}

export function formatDay(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
