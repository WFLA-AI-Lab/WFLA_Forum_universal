import { existsSync, readFileSync } from 'node:fs';

export function loadDotEnv(filename = process.env.WFLA_ENV_FILE ?? '.env') {
  if (!existsSync(filename)) return;
  for (const rawLine of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*)(.*)$/.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    const name = match[1];
    const rawValue = match[2];
    if (process.env[name] !== undefined) continue;
    process.env[name] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}