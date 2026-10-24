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

function checkOwner() {
  const dbPath = resolve(process.env.WFLA_DB_PATH ?? 'data/wfla-wall.sqlite');
  if (!existsSync(dbPath)) {
    console.log('owner missing');
    process.exitCode = 1;
    return;
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const owner = db.prepare("SELECT username FROM users WHERE role = 'owner' LIMIT 1").get();
    if (owner?.username) {
      console.log(`owner exists: ${owner.username}`);
      return;
    }
  } catch {
    // Treat an uninitialized or unreadable database as missing.
  } finally {
    db?.close();
  }
  console.log('owner missing');
  process.exitCode = 1;
}

function createOwner() {
  const args = process.argv.slice(2);
  const envPassword = process.env.WFLA_OWNER_PASSWORD;
  let username;
  let password;
  let realName;
  let graduationYear;

  if (args.length === 3 && envPassword) {
    [username, realName, graduationYear] = args;
    password = envPassword;
  } else {
    [username, password, realName, graduationYear] = args;
  }

  if (!username || !realName || !graduationYear) {
    console.error('Usage: WFLA_OWNER_PASSWORD=... npm run selfhost:create-owner -- <username> <真实中文姓名> <届别>');
    console.error('兼容旧方式：npm run selfhost:create-owner -- <username> <password> <真实中文姓名> <届别>（不推荐，密码可能进入命令历史）');
    process.exitCode = 1;
    return;
  }
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
    console.error('用户名需为 3-32 位字母、数字或下划线');
    process.exitCode = 1;
    return;
  }
  if (!/^[\u4e00-\u9fa5]{2,10}$/.test(realName) || !/^20\d{2}$/.test(graduationYear)) {
    console.error('真实姓名或届别格式无效');
    process.exitCode = 1;
    return;
  }
  if (!process.env.AUTH_SESSION_SECRET?.trim()) {
    console.error('缺少 AUTH_SESSION_SECRET。请先运行 scripts/一键配置.ps1，不要手工绕过配置检查。');
    process.exitCode = 1;
    return;
  }

  const dbPath = resolve(process.env.WFLA_DB_PATH ?? 'data/wfla-wall.sqlite');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    const existingOwner = db.prepare("SELECT id, username FROM users WHERE role = 'owner' LIMIT 1").get();
    if (existingOwner && process.env.WFLA_OWNER_EXISTS === 'skip') {
      console.log(`owner already exists: ${existingOwner.username}, skipping`);
      return;
    }

    if (!password || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/.test(password)) {
      console.error('密码强度不足：至少 10 位，含大小写字母、数字和符号');
      process.exitCode = 1;
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (existing) {
      console.error('用户名已存在');
      process.exitCode = 1;
      return;
    }

    const now = new Date().toISOString();
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

    console.log(`owner created: ${username}`);
    console.log('AUTH_SESSION_SECRET 已由首次配置脚本写入本地 .env，不会在终端重复打印。');
  } finally {
    db.close();
  }
}

if (process.argv[2] === '--check') {
  checkOwner();
} else {
  createOwner();
}