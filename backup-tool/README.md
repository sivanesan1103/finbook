# FinBook Backup Tool

A small self-contained web app that replaces the old `sql_backup.sh` cron
script: it takes a daily backup of the `finbook` database on its own
schedule, and gives you a browser UI to download, upload, and restore SQL
dumps directly — no SSH needed for routine backup/restore work.

## Why this exists

The database is the only thing that actually matters if this server ever
needs to move (see the "relocating production" note in the deploy README) —
everything else is just containers that can be rebuilt from source. This
tool keeps backups portable (plain gzipped `mysqldump` output on a bind
mount) and gives a safe, auditable way to restore them.

## How it works

- **Daily backup**: a cron schedule (`CRON_SCHEDULE`, default `0 2 * * *`,
  UTC) inside the container runs `mysqldump` over the network to the `db`
  service, gzips the result, and writes it to `/backups` as
  `finbook_backup_<date>.sql.gz`. A backup is only kept if it actually
  looks like a real dump (checked before the file is renamed into place) —
  a failed dump never leaves a corrupt file behind.
- **Retention**: backups older than `RETENTION_DAYS` (default 7) move to a
  `trash/` subfolder instead of being deleted outright; trash is only
  hard-deleted after `TRASH_RETENTION_DAYS` (default 14). A wrong retention
  setting costs a delayed cleanup, never instant permanent loss.
- **Restore**: always takes a fresh safety backup of the *current* database
  immediately before restoring anything, and verifies the target file looks
  like a real dump before touching the database at all. The restore itself
  drops and recreates the database from the dump — a genuine full reset,
  not an overlay (a plain `mysqldump` restore alone would NOT remove tables
  created after the backup was taken).
- **Auth**: HTTP Basic Auth (`BACKUP_TOOL_USER` / `BACKUP_TOOL_PASS`). This
  tool can wipe and replace the entire production database — treat those
  credentials with the same care as the database root password itself, and
  don't put this port behind anything less protected than what already
  guards the rest of this stack.

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `DB_HOST` / `DB_PORT` | `db` / `3306` | Reaches the `db` service over the compose network |
| `DB_NAME` | `finbook` | |
| `DB_USER` / `DB_PASSWORD` | `root` / — | Needs privileges to drop/create the database |
| `BACKUP_DIR` | `/backups` | Mount this to a host path or named volume |
| `RETENTION_DAYS` | `7` | Live backups older than this move to trash |
| `TRASH_RETENTION_DAYS` | `14` | Trash older than this is hard-deleted |
| `CRON_SCHEDULE` | `0 2 * * *` | UTC |
| `BACKUP_TOOL_USER` / `BACKUP_TOOL_PASS` | `admin` / — | Required — the app refuses to start without a password set |

## Relocating production

Because backups are plain files on a bind-mounted directory, moving servers
is just: copy that directory to the new host, mount it at the same path in
the new `docker-compose.yml`, and point `DB_HOST` at the new `db` service.
Nothing about the tool itself needs to change.
