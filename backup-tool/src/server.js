import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { basicAuth } from './auth.js';
import {
  deleteFromTrash, ensureDirs, isSafeName, liveDir, listBackups, moveToTrash, restoreFromTrash, timeStamp,
} from './backups.js';
import { config } from './config.js';
import { isBusy } from './db.js';
import { getLastRun, restoreFromSupabase, runBackupNow, runRestore } from './jobs.js';
import { startScheduler } from './scheduler.js';
import { ensureBucket, fetchSupabaseObject, listSupabaseBackups, supabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!config.authPassword) {
  console.error('FATAL: BACKUP_TOOL_PASS is not set — refusing to start with no real auth.');
  process.exit(1);
}
if (!config.dbPassword) {
  console.error('FATAL: DB_PASSWORD is not set.');
  process.exit(1);
}

await ensureDirs();
if (supabaseEnabled()) {
  try {
    await ensureBucket();
  } catch (err) {
    console.error(`Supabase bucket setup failed (backups will still work locally): ${err.message}`);
  }
}

const app = express();
app.use(express.json());
app.use(basicAuth);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, liveDir),
    filename: (_req, file, cb) => {
      const ext = file.originalname.endsWith('.sql.gz') ? '.sql.gz' : '.sql';
      const base = path.basename(file.originalname, ext).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'upload';
      cb(null, `uploaded_${timeStamp()}_${base}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!/\.(sql|sql\.gz)$/i.test(file.originalname)) {
      return cb(new Error('Only .sql or .sql.gz files are accepted'));
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

app.get('/api/status', async (_req, res) => {
  res.json({
    busy: isBusy(),
    lastRun: getLastRun(),
    cronSchedule: config.cronSchedule,
    retentionDays: config.retentionDays,
    trashRetentionDays: config.trashRetentionDays,
    dbName: config.dbName,
    supabaseEnabled: supabaseEnabled(),
  });
});

app.get('/api/backups/remote', async (_req, res) => {
  if (!supabaseEnabled()) return res.json({ enabled: false, items: [] });
  try {
    res.json({ enabled: true, items: await listSupabaseBackups() });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

app.get('/api/backups/:name/download-remote', async (req, res) => {
  const { name } = req.params;
  if (!isSafeName(name)) return res.status(400).send('Invalid name');
  try {
    const upstream = await fetchSupabaseObject(name);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (upstream.headers.get('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    }
    const { Readable } = await import('node:stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    res.status(502).send(err.message);
  }
});

app.post('/api/backups/:name/restore-from-remote', async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'RESTORE') {
    return res.status(400).json({ ok: false, message: 'Type RESTORE to confirm — this replaces the live database.' });
  }
  try {
    const result = await restoreFromSupabase(req.params.name);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
});

app.get('/api/backups', async (_req, res) => {
  res.json(await listBackups());
});

app.post('/api/backups/run', async (_req, res) => {
  try {
    const result = await runBackupNow();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
});

app.get('/api/backups/:name/download', async (req, res) => {
  const { name } = req.params;
  if (!isSafeName(name)) return res.status(400).send('Invalid name');
  const full = path.join(liveDir, name);
  const st = await stat(full).catch(() => null);
  if (!st) return res.status(404).send('Not found');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', st.size);
  createReadStream(full).pipe(res);
});

app.post('/api/backups/:name/trash', async (req, res) => {
  try {
    await moveToTrash(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.post('/api/backups/:name/restore-from-trash', async (req, res) => {
  try {
    await restoreFromTrash(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.delete('/api/backups/:name', async (req, res) => {
  // Only ever hard-deletable from trash — forces the soft-delete step first.
  try {
    await deleteFromTrash(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, message: err.message });
    if (!req.file) return res.status(400).json({ ok: false, message: 'No file received' });
    res.json({ ok: true, name: req.file.filename });
  });
});

app.post('/api/restore', async (req, res) => {
  const { name, confirm } = req.body || {};
  if (confirm !== 'RESTORE') {
    return res.status(400).json({ ok: false, message: 'Type RESTORE to confirm — this replaces the live database.' });
  }
  try {
    const result = await runRestore(name);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

startScheduler();

app.listen(config.port, () => {
  console.log(`FinBook backup tool listening on :${config.port}`);
});
