import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const [username, password, realName, enrollmentYear] = process.argv.slice(2);
if (!username || !password || !realName || !enrollmentYear) {
  console.error('Usage: node scripts/create-owner.mjs <username> <password> <真实中文姓名> <届别>');
  process.exit(1);
}
if (!/^[\u4e00-\u9fa5]{2,10}$/.test(realName) || !/^20\d{2}$/.test(enrollmentYear)) {
  console.error('真实姓名或届别格式无效');
  process.exit(1);
}
if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/.test(password)) {
  console.error('密码强度不足');
  process.exit(1);
}
const dbPath = process.env.WFLA_DB_PATH ?? '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/wfla-wall.sqlite';
const db = new Database(dbPath);
const now = new Date().toISOString();
db.prepare(`INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'owner', 'active', ?, ?)`)
  .run(randomUUID(), username, bcrypt.hashSync(password, 12), realName, enrollmentYear, now, now);
console.log('owner created');
