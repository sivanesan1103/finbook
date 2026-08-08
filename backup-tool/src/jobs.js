import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createBackup, restoreBackup, runExclusive, verifyBackupFile } from './db.js';
import { dateStamp, isSafeName, liveDir, pruneOldBackups, timeStamp, trashDir } from './backups.js';
import { createUploadsArchive, pruneOldUploadsArchives } from './uploads.js';
import { downloadFromSupabase, pruneOldSupabaseBackups, supabaseEnabled, uploadToSupabase } from './supabase.js';

let lastRun = null; // { at, ok, message }

export function getLastRun() {
  return lastRun;
}

function recordRun(ok, message) {
  lastRun = { at: new Date().toISOString(), ok, message };
}

/** Used by both the daily cron job and the "Backup now" button, so there's
 * exactly one place that decides the filename and does the post-backup
 * pruning — the two triggers can never drift out of sync with each other. */
export async function runBackupNow() {
  return runExclusive('backup', async () => {
    let name = `finbook_backup_${dateStamp()}.sql.gz`;
    // A backup for today already exists (e.g. a manual re-run) — don't
    // silently clobber it, suffix with the time instead. Checks trash too:
    // once Supabase sync succeeds, the local copy is deleted (see below),
    // so a plain-name backup that's already been synced-and-cleaned-up
    // won't be in liveDir anymore, only in trash (soft-deleted, not gone) —
    // missing that check is exactly what let two different backups collide
    // under the same Supabase object name.
    if (existsSync(path.join(liveDir, name)) || existsSync(path.join(trashDir, name))) {
      name = `finbook_backup_${dateStamp()}_${timeStamp().slice(11)}.sql.gz`;
    }
    const dest = path.join(liveDir, name);
    try {
      const { warnings } = await createBackup(dest);

      // Uploads are archived right after the dump so the two form a matched
      // pair. A failure here must not fail the run — the database is the
      // irreplaceable part, and losing the tarball is recorded as a warning
      // rather than throwing away a good SQL backup.
      let uploads = null;
      let uploadsError = null;
      try {
        uploads = await createUploadsArchive();
      } catch (err) {
        uploadsError = err.message;
      }

      // Offsite copy to Supabase Storage. Local disk on this box is scarce,
      // so once Supabase confirms the upload, the local copy is deleted
      // immediately — Supabase becomes the actual store, local disk is just
      // a staging area during creation. If the upload fails (or Supabase
      // isn't configured), the local file is deliberately KEPT and falls
      // back to the normal local retention/pruning below — a network
      // hiccup must never be the reason a backup is lost.
      //
      // The pre-upload name check above (liveDir + trashDir) is a
      // best-effort guess, not a guarantee — Supabase is the actual source
      // of truth on what names are taken, and it can disagree (e.g. a name
      // whose local copy was already trashed-and-purged days ago). uploadOrRetry
      // treats Supabase's "already exists" response as authoritative and
      // retries once under a fresh name rather than giving up.
      const uploadOrRetry = async (localPath, remoteName) => {
        try {
          await uploadToSupabase(localPath, remoteName);
          return remoteName;
        } catch (err) {
          if (!err.isDuplicate) throw err;
          const retryName = remoteName.replace(/(\.sql\.gz|\.tgz)$/, `_${timeStamp().slice(11)}$1`);
          await uploadToSupabase(localPath, retryName);
          return retryName;
        }
      };

      let supabaseError = null;
      let keptLocal = true;
      let supabaseName = name;
      if (supabaseEnabled()) {
        try {
          supabaseName = await uploadOrRetry(dest, name);
          if (uploads) await uploadOrRetry(path.join(liveDir, uploads.name), uploads.name);
          await pruneOldSupabaseBackups().catch(() => {});

          await rm(dest, { force: true });
          if (uploads) await rm(path.join(liveDir, uploads.name), { force: true });
          keptLocal = false;
        } catch (err) {
          supabaseError = err.message;
        }
      }

      if (keptLocal) {
        await pruneOldBackups();
        await pruneOldUploadsArchives().catch(() => {});
      }

      const notes = [
        warnings ? `with warnings: ${warnings.slice(0, 300)}` : null,
        uploads ? `uploads: ${uploads.name}` : null,
        uploadsError ? `UPLOADS FAILED: ${uploadsError.slice(0, 200)}` : null,
        supabaseEnabled() && !supabaseError && supabaseName === name ? 'synced to Supabase, local copy removed' : null,
        supabaseEnabled() && !supabaseError && supabaseName !== name ? `synced to Supabase as ${supabaseName} (renamed — ${name} already existed there), local copy removed` : null,
        supabaseError ? `SUPABASE SYNC FAILED (kept locally instead): ${supabaseError.slice(0, 200)}` : null,
      ].filter(Boolean);
      recordRun(true, `Created ${name}${notes.length ? ` (${notes.join('; ')})` : ''}`);
      return { name, uploads: uploads?.name ?? null };
    } catch (err) {
      recordRun(false, err.message);
      throw err;
    }
  });
}

/** Pulls a backup down from Supabase into the live local directory (so it
 * shows up in the normal backup list, downloadable/inspectable like any
 * other), then hands off to the same runRestore() path as a local file —
 * one restore code path, one safety-backup guarantee, regardless of source. */
export async function restoreFromSupabase(name) {
  if (!isSafeName(name)) throw new Error('Invalid backup name');
  const dest = path.join(liveDir, name);
  if (!existsSync(dest)) {
    await downloadFromSupabase(name, dest);
  }
  try {
    return await runRestore(name);
  } finally {
    // Already safely in Supabase (that's where it just came from) — don't
    // let the download-for-restore step become a second way local backups
    // quietly accumulate again.
    await rm(dest, { force: true }).catch(() => {});
  }
}

/** Deliberately NOT synced-then-deleted like normal backups — this one
 * exists specifically as an instant, zero-network fallback for the seconds
 * right after a restore goes wrong, so it stays on local disk rather than
 * requiring a round trip to Supabase at the exact moment things are risky.
 * It's small and rare (only created immediately before a restore), so it
 * doesn't meaningfully work against "local disk is scarce". */
export async function runPreRestoreSafetyBackup() {
  const name = `finbook_prerestore_${timeStamp()}.sql.gz`;
  const dest = path.join(liveDir, name);
  await createBackup(dest);
  return { name };
}

export async function runRestore(name) {
  if (!isSafeName(name)) throw new Error('Invalid backup name');
  const src = path.join(liveDir, name);
  if (!existsSync(src)) throw new Error('Backup file not found — it may be in trash; restore it to the live list first.');

  return runExclusive('restore', async () => {
    // Verify the file BEFORE anything touches the live database — a
    // corrupt/garbage file must fail here, not after the schema is dropped.
    await verifyBackupFile(src);

    // Always take a fresh snapshot immediately before overwriting the
    // database — if the file being restored turns out to be bad, this is
    // the only way back. Abort rather than restore if this fails.
    const safety = await runPreRestoreSafetyBackup();
    await restoreBackup(src);
    return { safetyBackup: safety.name };
  });
}
