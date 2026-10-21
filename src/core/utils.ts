import { randomUUID } from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function createId(): string {
  return randomUUID();
}

export function slugify(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'topic';
}

export function excerpt(markdown: string, length = 160): string {
  const text = markdown.replace(/[#>*_`~[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
