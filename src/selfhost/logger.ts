import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent extends Record<string, unknown> {
  level: LogLevel;
  message: string;
  time: string;
}

export interface FileLogger {
  logPath: string;
  debug: (message: string, fields?: Record<string, unknown>) => void;
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
  cleanup: (now?: Date) => void;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Matches the file names this logger creates; used only for retention. */
export function parseLogDateKey(filename: string): string | null {
  const match = /^wfla-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(filename);
  return match?.[1] ?? null;
}

export function createFileLogger(logDir: string, retentionDays = 14): FileLogger {
  const directory = resolve(logDir);
  mkdirSync(directory, { recursive: true });
  let currentDate = localDateKey(new Date());
  let currentPath = join(directory, `wfla-${currentDate}.jsonl`);
  if (!existsSync(currentPath)) writeFileSync(currentPath, '', { encoding: 'utf8', flag: 'wx' });

  function rotateIfNeeded(now = new Date()): void {
    const dateKey = localDateKey(now);
    if (dateKey === currentDate) return;
    currentDate = dateKey;
    currentPath = join(directory, `wfla-${dateKey}.jsonl`);
    if (!existsSync(currentPath)) writeFileSync(currentPath, '', { encoding: 'utf8', flag: 'wx' });
  }

  function cleanup(now = new Date()): void {
    const cutoff = now.getTime() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
    for (const filename of readdirSync(directory)) {
      const dateKey = parseLogDateKey(filename);
      if (!dateKey) continue;
      const fileTime = new Date(`${dateKey}T23:59:59.999`).getTime();
      if (fileTime < cutoff) {
        try { unlinkSync(join(directory, filename)); } catch { /* a locked old file can be removed next startup */ }
      }
    }
  }

  function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    const now = new Date();
    rotateIfNeeded(now);
    const event: LogEvent = { level, message, time: now.toISOString(), ...fields };
    appendFileSync(currentPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' });
  }

  // Startup is a good time to remove old files; long-running self-hosts can get
  // a fresh cleanup on the next restart without adding a timer or I/O pressure.
  cleanup();

  return {
    logPath: currentPath,
    debug: (message, fields) => { if (process.env.NODE_ENV !== 'production') write('debug', message, fields); },
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    cleanup
  };
}
