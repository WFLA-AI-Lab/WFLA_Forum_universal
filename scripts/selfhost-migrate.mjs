import { loadDotEnv } from '../src/selfhost/dotenv.ts';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

loadDotEnv();

const dbPath = resolve(process.env.WFLA_DB_PATH ?? 'data/wfla-wall.sqlite');
const migrationsDir = resolve(process.env.WFLA_MIGRATIONS_DIR ?? 'src/migrations');
mkdirSync(dirname(dbPath), { recursive: true });
if (!existsSync(migrationsDir)) throw new Error(`migrations dir not found: ${migrationsDir}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS _selfhost_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);`);

const applied = new Set(
  db.prepare('SELECT name FROM _selfhost_migrations').all().map(row => row.name)
);

for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()) {
  if (applied.has(file)) {
    console.log(`skip   ${file}`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  const apply = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _selfhost_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
  });
  apply();
  console.log(`apply  ${file}`);
}

console.log(`database ready: ${dbPath}`);
db.close();