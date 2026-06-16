// Goal 16 net-zero helper: hard-delete every live `project-assets` object that
// belongs to ONE project id, via the Supabase Storage REST API (service-role).
// The afterEach soft-deletes the DB row but does NOT touch live storage, so the
// generated images + logo source/parsed objects linger in the live bucket — this
// reclaims them. Deletes ONLY paths under `<projectId>/` and
// `generations/<projectId>/` — never anything else.
//
// Usage: node scripts/purge-project-storage.mjs <projectId>
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local.

/* global fetch, process, console */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../apps/web/.env.local');
const BUCKET = 'project-assets';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function listAll(base, key, prefix) {
  // Storage list is per-folder; recurse so we collect nested object paths.
  const found = [];
  async function walk(folder) {
    const res = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: folder, limit: 1000, offset: 0 }),
    });
    if (!res.ok) throw new Error(`list ${folder} → ${res.status} ${await res.text()}`);
    const rows = await res.json();
    for (const row of rows) {
      const full = folder ? `${folder}/${row.name}` : row.name;
      // A "folder" row has a null id (it's a prefix, not an object).
      if (row.id === null || row.id === undefined) await walk(full);
      else found.push(full);
    }
  }
  await walk(prefix);
  return found;
}

async function removeMany(base, key, paths) {
  if (paths.length === 0) return;
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`delete → ${res.status} ${await res.text()}`);
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
    console.error('usage: node scripts/purge-project-storage.mjs <projectId-uuid>');
    process.exit(1);
  }
  const env = loadEnv(ENV_PATH);
  const base = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in env');

  const prefixes = [projectId, `generations/${projectId}`];
  let all = [];
  for (const p of prefixes) all = all.concat(await listAll(base, key, p));
  // Safety: every path MUST contain the project id — refuse anything else.
  const safe = all.filter((p) => p.includes(projectId));
  if (safe.length !== all.length) {
    throw new Error(`refusing: ${all.length - safe.length} listed paths did not contain the id`);
  }
  console.log(`project ${projectId}: ${safe.length} live object(s) to delete`);
  for (const p of safe) console.log(`  - ${p}`);
  await removeMany(base, key, safe);
  console.log(`deleted ${safe.length} object(s) from ${BUCKET}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
