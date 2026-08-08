# FinBook — AWS production setup (100.99.22.48)

Permanent production runs on the AWS box, reachable over Tailscale
(`100.99.22.48`) and served to the internet through a **Cloudflare Tunnel**
(no inbound ports / security-group holes). Same deploy model as the Pi:
push to `main` → the box's self-hosted GitHub runner rebuilds and restarts.

Do these once to stand the box up. After that, every `git push` to `main`
deploys automatically.

---

## 0. Prerequisites on the box (Ubuntu)

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker

# Tailscale (so the box is 100.99.22.48)
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up

sudo apt-get update && sudo apt-get install -y git
```

## 1. Get the code to DEPLOY_PATH

```bash
export DEPLOY_PATH=/opt/finbook          # <- your choice; remember it for step 5
sudo mkdir -p "$DEPLOY_PATH" && sudo chown "$USER" "$DEPLOY_PATH"
git clone https://github.com/sivanesan1103/finbook.git "$DEPLOY_PATH"
cd "$DEPLOY_PATH"

# Use the production compose as the box's compose file:
cp deploy/docker-compose.prod.yml docker-compose.yml
cp deploy/.env.production.example .env
mkdir -p backups
```
> The clone provides `observability/`, `backend/`, `web/`, `backup-tool/`.
> The deploy only rsyncs `web/ backend/ backup-tool/` — it never touches your
> `docker-compose.yml`, `.env`, `observability/`, or `backups/`.

## 2. Fill in real secrets

```bash
cd "$DEPLOY_PATH"
# generate 4 strong app secrets
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET SHARE_TOKEN_SECRET FILE_URL_SECRET; do
  echo "$k=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-56)"
done
# ...paste those into .env, then also set MYSQL_*, BACKUP_TOOL_PASS,
# GF_SECURITY_ADMIN_PASSWORD, PUBLIC_WEB_URL, CORS_ORIGINS, and the
# CLOUDFLARE_TUNNEL_TOKEN from step 3.
nano .env
chmod 600 .env
```
The API **refuses to boot** if the 4 JWT/share/file secrets are missing or a
`change-me` placeholder — that's the guard working, not a bug.

## 3. Cloudflare Tunnel → `finbook.online`

In the Cloudflare dashboard (Zero Trust → Networks → Tunnels):
1. Create a tunnel, copy its **token** → put in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
2. Add public hostname routes:
   | Hostname | Service |
   |---|---|
   | `finbook.online` | `http://web:80` |
   | `api.finbook.online` (or `apifinbook.finbook.online`) | `http://api:4000` |
   | `grafana.finbook.online` | `http://grafana:3000` |
3. Cloudflare auto-creates the DNS records for the tunnel. Set
   `PUBLIC_WEB_URL`/`CORS_ORIGINS`/`GRAFANA_ROOT_URL` in `.env` to match.

> The `cloudflared` service in the compose runs the tunnel from the token —
> nothing else needs a public port. (Delete that service if you'd rather run
> cloudflared as a host `systemd` service.)

## 4. First bring-up (everything)

```bash
cd "$DEPLOY_PATH"
docker compose build
docker compose up -d
docker compose ps
# quick local health:
curl -s -o /dev/null -w 'web %{http_code}\n' http://localhost:8080/
curl -s -o /dev/null -w 'api %{http_code}\n' http://localhost:4000/   # 404/401 = up
curl -s -o /dev/null -w 'backup %{http_code}\n' http://localhost:4100/api/status  # 401 = up
```
Then open `https://finbook.online` — it should load through the tunnel.

## 5. Wire up auto-deploy (GitHub Actions self-hosted runner)

The workflow targets `runs-on: [self-hosted, rpi]`. Register the AWS runner
**with the `rpi` label** so no workflow change is needed (Repo → Settings →
Actions → Runners → New self-hosted runner):
```bash
# follow GitHub's shown commands; when it asks for labels, include: rpi
./config.sh --url https://github.com/sivanesan1103/finbook --token <TOKEN> --labels rpi
sudo ./svc.sh install && sudo ./svc.sh start
```
Set the repo secret **`DEPLOY_PATH`** = the path from step 1 (e.g. `/opt/finbook`).

> Prefer a cleaner label than `rpi`? Tell me and I'll change `runs-on` in
> `.github/workflows/deploy.yml` to e.g. `aws` and you label the runner `aws`.

## 6. From now on

`git push origin main` → the runner rsyncs source, `docker compose build api
web backup-tool`, `up -d`, health-checks. First-run services (db, cloudflared,
grafana, loki, promtail) keep running across deploys.

## Cutover checklist (Pi → AWS)
- [ ] Box up on Tailscale as 100.99.22.48, Docker installed
- [ ] `.env` filled with real secrets (`chmod 600`)
- [ ] Cloudflare tunnel token in `.env`, hostnames routed
- [ ] `docker compose up -d` green, `finbook.online` loads
- [ ] **Migrate data**: restore the latest Pi DB dump via the backup tool UI
      (`http://localhost:4100` over SSH tunnel) or `mysql < dump.sql`, and copy
      the Pi's `api_uploads` volume contents to the AWS one
- [ ] Runner registered (label `rpi`), `DEPLOY_PATH` secret set
- [ ] Stop the Pi runner so only one box deploys
- [ ] Point `finbook.online` DNS at the new tunnel; retire the old subdomains
