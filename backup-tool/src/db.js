import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';

// Never pass the DB password as a CLI argument (it would show up in `ps aux`
// on the host and inside the container) — write it to a short-lived
// defaults-extra-file instead, mode 0600, deleted right after the command.
async function withCredsFile(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'finbook-backup-'));
  const file = path.join(dir, '.my.cnf');
  const body = `[client]\nuser=${config.dbUser}\npassword=${config.dbPassword}\nhost=${config.dbHost}\nport=${config.dbPort}\n`;
  await writeFile(file, body, { mode: 0o600 });
  try {
    return await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
}

let busyLabel = null;

export function isBusy() {
  return busyLabel;
}

export async function runExclusive(label, fn) {
  if (busyLabel) {
    const err = new Error(`Another operation is already running: ${busyLabel}`);
    err.status = 409;
    throw err;
  }
  busyLabel = label;
  try {
    return await fn();
  } finally {
    busyLabel = null;
  }
}

/** Dumps the finbook database, gzips it, and writes it to destPath. Verifies
 * the result actually looks like a MySQL dump before returning — an empty or
 * truncated backup is worse than no backup, because it looks fine in a
 * listing until the day someone needs to restore it. */
export async function createBackup(destPath) {
  return withCredsFile(async (credsFile) => {
    // Write to a .part sibling and only rename into place on full success —
    // a failed dump must never leave a small, corrupt-but-listable file
    // where the real backup is expected.
    const partPath = `${destPath}.part`;
    const dump = spawn('mysqldump', [
      `--defaults-extra-file=${credsFile}`,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--events',
      '--add-drop-table',
      '--databases',
      config.dbName,
    ]);

    let stderr = '';
    dump.stderr.on('data', (d) => { stderr += d.toString(); });

    const gzip = zlib.createGzip();
    const out = createWriteStream(partPath);

    let sawHeader = false;
    let sawAnyData = false;
    dump.stdout.on('data', (chunk) => {
      sawAnyData = true;
      if (!sawHeader) {
        const text = chunk.toString('utf8', 0, Math.min(chunk.length, 4096));
        // The client that produced the dump varies (Oracle's mysqldump says
        // "MySQL dump", MariaDB's says "MariaDB dump") — accept either.
        if (/-- (MySQL|MariaDB) dump/.test(text)) sawHeader = true;
      }
    });

    dump.stdout.pipe(gzip).pipe(out);

    try {
      const [dumpCode] = await Promise.all([
        waitForExit(dump),
        new Promise((resolve, reject) => {
          out.on('finish', resolve);
          out.on('error', reject);
          gzip.on('error', reject);
        }),
      ]);

      if (dumpCode !== 0) {
        throw new Error(`mysqldump exited with code ${dumpCode}: ${stderr.slice(0, 2000)}`);
      }
      if (!sawAnyData || !sawHeader) {
        throw new Error('Backup produced no recognizable MySQL dump output — treating as failed.');
      }
      await rename(partPath, destPath);
      return { warnings: stderr.slice(0, 2000) };
    } catch (err) {
      await rm(partPath, { force: true });
      throw err;
    }
  });
}

/** Sanity-checks a backup file before it's allowed anywhere near a restore —
 * a corrupt upload should fail loudly here, before the database has been
 * touched, not partway through after the live schema is already dropped. */
export async function verifyBackupFile(srcPath) {
  const isGz = srcPath.endsWith('.gz');
  const source = createReadStream(srcPath);
  const stream = isGz ? source.pipe(zlib.createGunzip()) : source;

  let sawHeader = false;
  let buffered = '';
  await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      buffered += chunk.toString('utf8');
      if (/-- (MySQL|MariaDB) dump/.test(buffered) || /CREATE TABLE/.test(buffered)) {
        sawHeader = true;
        stream.destroy();
        resolve();
      }
      if (buffered.length > 65_536) { stream.destroy(); resolve(); }
    });
    stream.on('close', resolve);
    stream.on('end', resolve);
    stream.on('error', (err) => (isGz ? reject(new Error(`Not a valid gzip file: ${err.message}`)) : reject(err)));
  });

  if (!sawHeader) {
    throw new Error('File does not look like a MySQL/MariaDB dump — refusing to restore it.');
  }
}

async function runSql(credsFile, sql) {
  const mysql = spawn('mysql', [`--defaults-extra-file=${credsFile}`, '-e', sql]);
  let stderr = '';
  mysql.stderr.on('data', (d) => { stderr += d.toString(); });
  const code = await waitForExit(mysql);
  if (code !== 0) throw new Error(`mysql exited with code ${code}: ${stderr.slice(0, 2000)}`);
}

/** Restores a (optionally gzipped) SQL file into the database. Caller is
 * responsible for having taken a fresh safety backup first — this function
 * only performs the restore itself. */
export async function restoreBackup(srcPath) {
  return withCredsFile(async (credsFile) => {
    // A mysqldump's DROP TABLE IF EXISTS only covers tables that were
    // *in* the dump — anything created on the live DB after the backup was
    // taken would otherwise survive a "restore" untouched. Drop the whole
    // database first so restoring is a genuine full reset, not an overlay.
    await runSql(credsFile, `DROP DATABASE IF EXISTS \`${config.dbName}\`;`);

    const mysql = spawn('mysql', [`--defaults-extra-file=${credsFile}`]);

    let stderr = '';
    mysql.stderr.on('data', (d) => { stderr += d.toString(); });

    const isGz = srcPath.endsWith('.gz');
    const source = createReadStream(srcPath);
    if (isGz) {
      source.pipe(zlib.createGunzip()).pipe(mysql.stdin);
    } else {
      source.pipe(mysql.stdin);
    }

    const code = await waitForExit(mysql);
    if (code !== 0) {
      throw new Error(`mysql restore exited with code ${code}: ${stderr.slice(0, 2000)}`);
    }
    return { warnings: stderr.slice(0, 2000) };
  });
}
