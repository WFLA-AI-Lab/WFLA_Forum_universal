import Database from 'better-sqlite3';
import type { D1Database, D1PreparedStatement, D1Result, D1Meta, D1ExecResult } from '@cloudflare/workers-types';

type Bindable = string | number | bigint | boolean | null | Uint8Array;
type Row = Record<string, unknown>;

class StatementAdapter implements D1PreparedStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly values: Bindable[] = []
  ) {}

  executeSync(): void {
    const stmt = this.db.prepare(this.sql);
    if (stmt.reader) {
      stmt.all(...this.values as never[]);
      return;
    }
    stmt.run(...this.values as never[]);
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new StatementAdapter(this.db, this.sql, values.map(normalize));
  }

  async first<T = unknown>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values as never[]) as Row | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async run<T = Row>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    if (stmt.reader) return this.all<T>();
    const info = stmt.run(...this.values as never[]);
    return result<T>([], info.changes);
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    const rows = this.db.prepare(this.sql).all(...this.values as never[]) as T[];
    return result<T>(rows, rows.length);
  }

  async raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  async raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const rows = this.db.prepare(this.sql).raw(true).all(...this.values as never[]) as unknown as [string[], ...T[]];
    return options?.columnNames ? rows : rows.slice(1) as T[];
  }
}

function normalize(value: unknown): Bindable {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('Unsupported SQLite binding type');
}

function result<T>(results: T[], changes: number): D1Result<T> {
  const meta: D1Meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
    served_by_region: 'local',
    served_by_colo: 'local'
  };
  return { success: true, results, meta: meta as D1Meta & Record<string, unknown> };
}

export class SqliteD1 implements D1Database {
  readonly database: Database.Database;

  constructor(filename: string) {
    this.database = new Database(filename);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.database.pragma('busy_timeout = 5000');
  }

  prepare(query: string): D1PreparedStatement {
    return new StatementAdapter(this.database, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const transaction = this.database.transaction(() => {
      for (const statement of statements) {
        (statement as StatementAdapter).executeSync();
      }
    });
    transaction();
    return statements.map(() => result<T>([], 0));
  }

  async exec(query: string): Promise<D1ExecResult> {
    const started = Date.now();
    this.database.exec(query);
    return { count: 1, duration: Date.now() - started };
  }

  withSession(): never {
    throw new Error('D1 sessions are not supported in the SQLite adapter');
  }

  async dump(): Promise<ArrayBuffer> {
    const rows = this.database.prepare('SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type DESC, name').all() as { sql: string }[];
    const text = rows.map(row => `${row.sql};`).join('\n');
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
  }

  close(): void { this.database.close(); }
}