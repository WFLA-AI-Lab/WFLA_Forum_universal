import { loadDotEnv } from '../src/selfhost/dotenv.ts';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const [username, password, realName, graduationYear] = process.argv.slice(2);
if (!username || !password || !realName || !graduationYear) {
  console.error('Usage: npm run selfhost:create-owner -- <username> <password> <真实中文姓名> <届别>');
  process.exit(1);
}
if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
  console.error('用户名需为 3-32 位字母、数字或下划线');
  process.exit(1);
}
if (!/^[\u4e00-\u9fa5]{2,10}$/.test(realName) || !/^20\d{2}$/.test(graduationYear)) {
  console.error('真实姓名或届别格式无效');
  process.exit(1);
}
if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/.test(password)) {
  console.error('密码强度不足：至少 10 位，含大小写字母、数字和符号');
  process.exit(1);
}

loadDotEnv();

const dbPath = resolve(process.env.WFLA_DB_PATH ?? 'data/wfla-wall.sqlite');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
const now = new Date().toISOString();

const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (existing) {
  console.error('用户名已存在');
  process.exit(1);
}

db.prepare(`INSERT INTO users (id, username, password_hash, real_name, graduation_year, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'owner', 'active', ?, ?)`)
  .run(randomUUID(), username, bcrypt.hashSync(password, 12), realName, graduationYear, now, now);

if (process.env.WFLA_CREATE_DEFAULT_BOARDS === '1') {
  const boards = [
    ['general', '综合讨论', '校园生活、学习与日常交流', 0],
    ['academics', '学业交流', '课程、考试与学习方法', 1],
    ['clubs', '社团活动', '社团公告、活动招募与回顾', 2],
    ['tech', '技术与创作', '编程、AI、设计与作品分享', 3]
  ];
  const insert = db.prepare(`INSERT INTO boards (id, slug, name, description, position, is_active, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);
  for (const [slug, name, description, position] of boards) {
    const exists = db.prepare('SELECT 1 FROM boards WHERE slug = ?').get(slug);
    if (!exists) insert.run(randomUUID(), slug, name, description, position, now, now);
  }
}

const secret = randomBytes(32).toString('base64url');
console.log('owner created');
console.log(`AUTH_SESSION_SECRET=${secret}`);
console.log('请把这一行 AUTH_SESSION_SECRET 写入服务器上的 .env，不要提交到 Git。');
db.close();