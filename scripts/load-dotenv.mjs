import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// One-click scripts may be launched from a UNC share, mapped drive, or any
// terminal directory. Resolve paths from the location of this module instead
// of process.cwd(); scripts/ always sits one level below its project root.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function projectPath(...segments) {
  return resolve(projectRoot, ...segments);
}

export function loadDotEnv(filename = process.env.WFLA_ENV_FILE ?? '.env') {
  const envFile = projectPath(filename);
  if (!existsSync(envFile)) return;
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
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

