import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { config } from './config.js';

export const supabaseEnabled = () => Boolean(config.supabaseUrl && config.supabaseServiceKey);

function headers(extra = {}) {
  return {
    apikey: config.supabaseServiceKey,
    Authorization: `Bearer ${config.supabaseServiceKey}`,
    ...extra,
  };
}

function objectUrl(name) {
  return `${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${encodeURIComponent(name)}`;
}

/** Private bucket, created once if missing — offsite copies of database
 * dumps should never be publicly listable/downloadable. */
export async function ensureBucket() {
  const check = await fetch(`${config.supabaseUrl}/storage/v1/bucket/${config.supabaseBucket}`, {
    headers: headers(),
  });
  if (check.ok) return;

  const create = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: config.supabaseBucket, name: config.supabaseBucket, public: false }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`Failed to create Supabase bucket: ${create.status} ${await create.text()}`);
  }
}

/** Streams a local backup file up to Supabase Storage. Never upserts — two
 * different backups must never silently overwrite each other under the
 * same name. jobs.js is responsible for picking a name that's actually
 * free; if Supabase still reports it taken (isDuplicate on the thrown
 * error), the caller retries once under a fresh, timestamp-suffixed name. */
export async function uploadToSupabase(localPath, remoteName) {
  const st = await stat(localPath);
  const res = await fetch(objectUrl(remoteName), {
    method: 'POST',
    headers: headers({
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'false',
      'Content-Length': String(st.size),
    }),
    body: createReadStream(localPath),
    duplex: 'half',
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Supabase upload failed: ${res.status} ${body}`);
    err.isDuplicate = res.status === 400 && /KeyAlreadyExists|Duplicate/i.test(body);
    throw err;
  }
}

export async function downloadFromSupabase(remoteName, localPath) {
  const res = await fetch(objectUrl(remoteName), { headers: headers() });
  if (!res.ok) {
    throw new Error(`Supabase download failed: ${res.status} ${await res.text()}`);
  }
  const { writeFile } = await import('node:fs/promises');
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buf);
}

/** Raw fetch Response for streaming straight through to an HTTP client —
 * used by the download route so a browser can pull a Supabase-only backup
 * (one whose local copy was already cleaned up) without staging it to disk
 * on this already disk-constrained box first. */
export async function fetchSupabaseObject(remoteName) {
  const res = await fetch(objectUrl(remoteName), { headers: headers() });
  if (!res.ok) {
    throw new Error(`Supabase download failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function listSupabaseBackups() {
  const res = await fetch(`${config.supabaseUrl}/storage/v1/object/list/${config.supabaseBucket}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  if (!res.ok) {
    throw new Error(`Supabase list failed: ${res.status} ${await res.text()}`);
  }
  const items = await res.json();
  return items
    .filter((i) => i.name && i.id) // folders/placeholder entries have no id
    .map((i) => ({
      name: i.name,
      sizeBytes: i.metadata?.size ?? null,
      createdAt: i.created_at,
    }));
}

export async function deleteFromSupabase(names) {
  if (!names.length) return;
  const res = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: names }),
  });
  if (!res.ok) {
    throw new Error(`Supabase delete failed: ${res.status} ${await res.text()}`);
  }
}

/** Mirrors pruneOldBackups' local retention, applied to the remote copies —
 * otherwise Supabase storage (and its cost) grows forever. */
export async function pruneOldSupabaseBackups() {
  const now = Date.now();
  const items = await listSupabaseBackups();
  const stale = items
    .filter((i) => (now - new Date(i.createdAt).getTime()) / 86_400_000 > config.supabaseRetentionDays)
    .map((i) => i.name);
  if (stale.length) await deleteFromSupabase(stale);
  return stale;
}
