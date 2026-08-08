import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBackup, restoreBackup, runExclusive, verifyBackupFile } from './db.js';
import { dateStamp, isSafeName, liveDir, pruneOldBackups, timeStamp } from './backups.js';
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
    if (existsSync(path.join(liveDir, name))) {
      // A backup for today already exists (e.g. a manual re-run) — don't
      // silently clobber it, suffix with the time instead.
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

      await pruneOldBackups();
      await pruneOldUploadsArchives().catch(() => {});

      // Offsite copy to Supabase Storage, best-effort — same reasoning as
      // the uploads archive above: the local .sql.gz is already safe on
      // disk, so a Supabase failure is a warning, not a failed run.
      let supabaseError = null;
      if (supabaseEnabled()) {
        try {
          await uploadToSupabase(dest, name);
          if (uploads) await uploadToSupabase(path.join(liveDir, uploads.name), uploads.name);
          await pruneOldSupabaseBackups().catch(() => {});
        } catch (err) {
          supabaseError = err.message;
        }
      }

      const notes = [
        warnings ? `with warnings: ${warnings.slice(0, 300)}` : null,
        uploads ? `uploads: ${uploads.name}` : null,
        uploadsError ? `UPLOADS FAILED: ${uploadsError.slice(0, 200)}` : null,
        supabaseEnabled() && !supabaseError ? 'synced to Supabase' : null,
        supabaseError ? `SUPABASE SYNC FAILED: ${supabaseError.slice(0, 200)}` : null,
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
  return runRestore(name);
}

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
