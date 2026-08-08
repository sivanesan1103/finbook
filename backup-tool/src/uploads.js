import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readdir, rm, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { dateStamp, liveDir, timeStamp } from './backups.js';

/**
 * Bill photos and business logos live on a Docker volume, not in MySQL, so
 * the SQL dump alone is only half a backup: restoring it would bring back
 * expense rows whose `attachment` paths point at files that no longer exist.
 *
 * These tarballs deliberately use a `.tgz` name, which `isSafeName()` in
 * backups.js rejects — that keeps them out of the SQL restore listing/UI, so
 * nobody can accidentally "restore" an uploads archive into the database.
 * They get their own retention sweep below instead.
 */
const TGZ_NAME = /^finbook_uploads_[A-Za-z0-9._-]+\.tgz$/;

export function isUploadsArchive(name) {
  return typeof name === 'string' && TGZ_NAME.test(name) && !name.includes('..');
}

async function isNonEmptyDir(dir) {
  try {
    const st = await stat(dir);
    if (!st.isDirectory()) return false;
    const names = await readdir(dir);
    // .gitkeep alone doesn't count as "there are uploads to back up".
    return names.some((n) => n !== '.gitkeep');
  } catch {
    return false;
  }
}

/**
 * Tars + gzips the uploads directory next to the SQL dump, using the same
 * write-to-`.part`-then-rename discipline as createBackup() so a failed run
 * never leaves a truncated archive sitting where a good one is expected.
 *
 * Returns null when there is nothing to archive (fresh install, no bills yet).
 */
export async function createUploadsArchive() {
  if (!(await isNonEmptyDir(config.uploadsDir))) return null;

  let name = `finbook_uploads_${dateStamp()}.tgz`;
  try {
    await stat(path.join(liveDir, name));
    name = `finbook_uploads_${dateStamp()}_${timeStamp().slice(11)}.tgz`;
  } catch { /* no same-day archive yet — keep the plain dated name */ }

  const dest = path.join(liveDir, name);
  const partPath = `${dest}.part`;

  // -C so the archive holds relative paths ("./bill.jpg"), not the absolute
  // container path — otherwise extracting on another host is a mess.
  const tar = spawn('tar', ['-czf', '-', '-C', config.uploadsDir, '.']);
  const out = createWriteStream(partPath);

  let stderr = '';
  tar.stderr.on('data', (d) => { stderr += d.toString(); });
  tar.stdout.pipe(out);

  try {
    const [code] = await Promise.all([
      new Promise((resolve) => tar.on('close', resolve)),
      new Promise((resolve, reject) => {
        out.on('finish', resolve);
        out.on('error', reject);
      }),
    ]);
    if (code !== 0) throw new Error(`tar exited ${code}: ${stderr.slice(0, 300)}`);

    const st = await stat(partPath);
    if (st.size === 0) throw new Error('uploads archive was empty');

    await rename(partPath, dest);
    return { name, sizeBytes: st.size };
  } catch (err) {
    await rm(partPath, { force: true }).catch(() => {});
    throw err;
  }
}

/** Same retention window as the SQL dumps, but deleted outright — these are
 * reproducible from the previous archive plus the volume, and keeping a
 * trash copy of large binaries would double the disk cost. */
export async function pruneOldUploadsArchives() {
  const now = Date.now();
  let names;
  try {
    names = await readdir(liveDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!isUploadsArchive(name)) continue;
    const full = path.join(liveDir, name);
    const st = await stat(full).catch(() => null);
    if (!st) continue;
    const ageDays = (now - st.mtime.getTime()) / 86_400_000;
    if (ageDays > config.uploadsRetentionDays) {
      await rm(full, { force: true }).catch(() => {});
    }
  }
}
