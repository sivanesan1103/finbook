# FinBook — Operations reference

Day-to-day reference for the running production system. For first-time
server setup, see [DEPLOY-AWS.md](./DEPLOY-AWS.md) instead — this doc
assumes the box is already up.

---

## 1. Infrastructure map

| Component | Where it runs | How to reach it |
|---|---|---|
| Web app | AWS box, `finbook-web` container | `https://finbook.online` |
| API | AWS box, `finbook-api` container | `https://api.finbook.online` |
| MySQL database | AWS box, `finbook-db` container | Not public — `127.0.0.1:3306` on the box only |
| Backup tool (UI + API) | AWS box, `finbook-backup` container | `http://localhost:4100` over SSH/Tailscale tunnel |
| Log storage (Loki) | AWS box, `finbook-loki` container | `http://100.99.22.48:3100` — Tailscale only |
| Log shipper (Promtail) | AWS box, `finbook-promtail` container | n/a (pushes to Loki) |
| Host metrics (node-exporter) | AWS box, `finbook-node-exporter` container | `http://100.99.22.48:9100` — Tailscale only |
| Grafana (dashboards) | **Your own machine**, not the box | `http://localhost:3001` (or whatever port you mapped) |
| Prometheus (scrapes node-exporter) | **Your own machine**, not the box | `http://localhost:9090` |
| Public ingress | `finbook-cloudflared` container (Cloudflare Tunnel) | No inbound ports open anywhere |
| Offsite backup copy | Supabase Storage, bucket `finbook-backups` | `https://vvoowtstyyijlsvrcpud.supabase.co` |

The AWS box is a `t3.micro` (908MB RAM, currently ~6.7GB disk) — see
[DEPLOY-AWS.md](./DEPLOY-AWS.md) for the memory tuning already applied
(MySQL, Promtail) and why Grafana/Prometheus deliberately don't run on it.

SSH: `ssh ubuntu@100.99.22.48` (Tailscale IP — the box has no public IP
exposure). Deploy path on the box: `/opt/finbook`.

---

## 2. All keys — what each one is for

Live values are in `/opt/finbook/.env` on the box (`chmod 600`, never in
git). This is the full list and what breaks if it's wrong/missing:

| Key | Used by | If missing/wrong |
|---|---|---|
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | `db`, `api`, `backup-tool` | API can't connect to the database |
| `MYSQL_ROOT_PASSWORD` | `db`, `backup-tool` | Backups/restores fail (they connect as root) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `api` | API **refuses to boot** in production if missing or a placeholder (boot-guard in `config/env.js`) |
| `SHARE_TOKEN_SECRET` | `api` | Signed share links (e.g. shared invoices) can't be verified |
| `FILE_URL_SECRET` | `api` | Signed `/uploads/...` URLs can't be verified — bill photos/logos 403 |
| `PUBLIC_WEB_URL` / `CORS_ORIGINS` | `api` | Browser requests from the web app get blocked by CORS |
| `BACKUP_TOOL_USER` / `BACKUP_TOOL_PASS` | `backup-tool` | Login for `http://localhost:4100` (the backup/restore UI) |
| `CLOUDFLARE_TUNNEL_TOKEN` | `cloudflared` | No public ingress at all — `finbook.online` and `api.finbook.online` go down |
| `TAILSCALE_IP` | `loki`, `node-exporter` compose config | Their ports fail to bind (they're bound to this specific IP, not `0.0.0.0`, so nothing but the tailnet can ever reach them) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BACKUP_BUCKET` | `backup-tool` | Offsite backup sync silently disables itself (`supabaseEnabled()` returns false) — local backups still work fine |
| `DISCORD_WEBHOOK_URL` | `api` | Server error/crash/failed-login notifications silently don't send — everything else works normally |

`SUPABASE_SERVICE_ROLE_KEY` must be the **secret** key (starts
`sb_secret_...`), not the publishable one (`sb_publishable_...`) — the
publishable key is meant to be client-safe/public and can't reliably write
to a private Storage bucket server-side. Find it on the Supabase dashboard:
**Project Settings → API Keys → Secret keys** (create one if the list is
empty).

To see current (real) values: `ssh ubuntu@100.99.22.48 "grep -v '^#' /opt/finbook/.env"`.

---

## 3. Backups — how they work

**Automatic:** every day at 02:00 UTC (`CRON_SCHEDULE` in the compose
file), `backup-tool` runs `mysqldump --single-transaction` (never locks
tables — the live app keeps running at full speed during the dump) plus a
tarball of uploaded bill photos/logos.

**Where they end up:**
- Uploaded to Supabase Storage (bucket `finbook-backups`) — this is the
  real, durable copy.
- The local copy on the box is **deleted immediately** once the Supabase
  upload confirms — local disk is scarce on this box, so it's only a
  staging area during creation, not long-term storage.
- If Supabase is unreachable or misconfigured, the local copy is
  **kept** instead, and falls back to the old local retention (7 days
  live, 14 in trash) — a network hiccup can never be the reason a backup
  is lost.
- The one exception: right before a **restore**, a safety snapshot of the
  current database is always taken and kept **local-only** (never synced,
  never auto-deleted) — it's an instant, zero-network fallback for the
  seconds right after a restore, when you most don't want a dependency on
  the network.

### Triggering a backup manually

**Via the UI** (recommended — no credentials to remember):
1. Open an SSH tunnel: `ssh -L 4100:localhost:4100 ubuntu@100.99.22.48`
2. Open `http://localhost:4100` in your browser, log in
   (`BACKUP_TOOL_USER` / `BACKUP_TOOL_PASS` from `.env`)
3. Click **"Backup now"**

**Via the API** (from the box itself, or over the same SSH tunnel):
```bash
ssh ubuntu@100.99.22.48
AUTH=$(grep BACKUP_TOOL_USER /opt/finbook/.env | cut -d= -f2):$(grep BACKUP_TOOL_PASS /opt/finbook/.env | cut -d= -f2)
curl -s -u "$AUTH" -X POST http://localhost:4100/api/backups/run
```
Check what happened:
```bash
curl -s -u "$AUTH" http://localhost:4100/api/status | python3 -m json.tool
```
`lastRun.message` says exactly what happened, e.g. `Created
finbook_backup_2026-08-08.sql.gz (synced to Supabase, local copy
removed)` or, if Supabase failed, `SUPABASE SYNC FAILED (kept locally
instead): ...`.

### Restoring

From the UI, both the "Live backups" table (local, normally near-empty)
and the "☁️ Supabase (offsite)" table have a **Restore** button. Either
path: verifies the file isn't corrupt → takes a fresh local safety
snapshot of current data → restores → tells you the safety snapshot's
filename in case you need to undo it.

From the API (local file):
```bash
curl -s -u "$AUTH" -X POST http://localhost:4100/api/restore \
  -H 'Content-Type: application/json' \
  -d '{"name":"<backup-filename>","confirm":"RESTORE"}'
```
From the API (Supabase file — downloads it first, then same restore path):
```bash
curl -s -u "$AUTH" -X POST "http://localhost:4100/api/backups/<backup-filename>/restore-from-remote" \
  -H 'Content-Type: application/json' \
  -d '{"confirm":"RESTORE"}'
```

### Checking Supabase sync is actually working

```bash
curl -s -u "$AUTH" http://localhost:4100/api/backups/remote | python3 -m json.tool
```
Lists everything currently in the Supabase bucket with size/date. Compare
against `curl -s -u "$AUTH" http://localhost:4100/api/backups` (local) —
under normal operation, local should be near-empty (just the daily backup
briefly, or a pre-restore safety file) and Supabase should have the full
history back to its 7-day retention window.

---

## 4. Cleaning up

- **Docker build cache**: `docker builder prune -af` on the box — safe,
  reclaims image-build layers that aren't in any running container.
- **Old backups**: handled automatically (7-day local, 7-day Supabase,
  14-day trash) — no manual cleanup needed under normal operation.
- Never manually delete anything under `/opt/finbook/mysql-conf.d`,
  `docker-compose.yml`, or `.env` on the box — they're hand-tuned for this
  specific `t3.micro` and aren't regenerated automatically.
