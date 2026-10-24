import { loadDotEnv } from './load-dotenv.mjs';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

loadDotEnv();

const source = resolve(process.env.WFLA_DB_PATH ?? 'data/wfla-wall.sqlite');
const backupDir = resolve(process.env.WFLA_BACKUP_DIR ?? 'backups');
if (!existsSync(source)) {
  console.error(`database not found: ${source}`);
  process.exit(1);
}
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const target = resolve(backupDir, `wfla-wall-${stamp}.sqlite`);

const db = new Database(source);
db.pragma('wal_checkpoint(TRUNCATE)');
db.backup(target).then(() => {
  db.close();
  console.log(`backup written: ${target}`);
}).catch(error => {
  db.close();
  console.error(error);
  process.exit(1);
});