import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { loadDotEnv } from './load-dotenv.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectRoot);
loadDotEnv();

const dbPath = resolve(process.env.WFLA_DB_PATH ?? 'data/wfla-wall.sqlite');
if (!existsSync(dbPath)) {
  console.error('数据库不存在，请先运行 npm run selfhost:migrate');
  process.exitCode = 1;
} else {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  try {
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get('test');
    const passwordHash = bcrypt.hashSync('Test123456', 12);
    if (existing) {
      db.prepare(`UPDATE users SET password_hash = ?, real_name = ?, graduation_year = ?, role = 'member',
                  status = 'active', updated_at = ? WHERE id = ?`)
        .run(passwordHash, '测试同学', '2029', now, existing.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
      console.log('test account refreshed: test / Test123456');
    } else {
      db.prepare(`INSERT INTO users
        (id, username, password_hash, real_name, graduation_year, role, status, created_at, updated_at)
        VALUES (?, 'test', ?, '测试同学', '2029', 'member', 'active', ?, ?)`)
        .run(randomUUID(), passwordHash, now, now);
      console.log('test account created: test / Test123456');
    }
  } finally {
    db.close();
  }
}
