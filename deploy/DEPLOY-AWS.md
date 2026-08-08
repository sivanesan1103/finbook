# FinBook — AWS production setup (100.99.22.48)

Permanent production runs on the AWS box, reachable over Tailscale
(`100.99.22.48`) and served to the internet through a **Cloudflare Tunnel**
(no inbound ports / security-group holes). Push to `main` → the box's
self-hosted GitHub Actions runner (label **`aws_fin`**) rebuilds and restarts
the app automatically.

Do steps 0–6 once to stand the box up. After that, every `git push` to `main`
deploys automatically, and every container survives crashes **and** a full
server reboot (see step 7).

---

## 0. Prerequisites on the box (Ubuntu)

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker

# Docker must start on boot — get.docker.com enables this by default, verify:
sudo systemctl enable --now docker
systemctl is-enabled docker   # must print "enabled"

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
cp -r deploy/mysql-conf.d mysql-conf.d
mkdir -p backups
```
> The clone provides `observability/`, `backend/`, `web/`, `backup-tool/`.
> The deploy only rsyncs `web/ backend/ backup-tool/` — it never touches your
> `docker-compose.yml`, `.env`, `observability/`, or `backups/`.

## 2. Fill in real secrets

Paste the generated block from the delivery message (or your own, via
`openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-56`) into `.env`:

```bash
cd "$DEPLOY_PATH"
nano .env        # paste every KEY=value from the "Full key/value block" below
chmod 600 .env    # secrets file is owner-read-only
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
   | `api.finbook.online` | `http://api:4000` |
3. Cloudflare auto-creates the DNS records for the tunnel. Confirm
   `PUBLIC_WEB_URL` / `CORS_ORIGINS` in `.env` match.

   Grafana has **no** tunnel route — it isn't public at all. See step 8.

> The `cloudflared` service in the compose runs the tunnel from the token —
> nothing else needs a public port.

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

The workflow targets `runs-on: [self-hosted, aws_fin]`. Register the AWS
runner **with the `aws_fin` label** (GitHub repo → Settings → Actions →
Runners → New self-hosted runner, follow its download commands, then):

```bash
./config.sh --url https://github.com/sivanesan1103/finbook \
            --token <TOKEN_SHOWN_ON_GITHUB> \
            --labels aws_fin \
            --name aws-fin-prod --unattended

# Install as a systemd service so it survives reboots and crashes:
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status          # should show "active (running)"
```
Set the repo secret **`DEPLOY_PATH`** = the path from step 1 (e.g. `/opt/finbook`)
at GitHub → repo → Settings → Secrets and variables → Actions.

## 6. Verify the pipeline end-to-end

```bash
# from your Mac:
git commit --allow-empty -m "chore: verify aws_fin deploy" && git push origin main
gh run watch --exit-status   # should show the aws_fin runner picking it up
```

## 7. Make everything restart-proof (crash AND reboot)

Already covered, listed here so it's auditable:

| Layer | Mechanism | Verify |
|---|---|---|
| Container crash/OOM | `restart: unless-stopped` on every service in the compose | `docker inspect finbook-api --format '{{.HostConfig.RestartPolicy.Name}}'` → `unless-stopped` |
| Docker daemon itself starts after reboot | `systemctl enable docker` (step 0) | `systemctl is-enabled docker` → `enabled` |
| Containers come back after a reboot | Docker restarts anything not manually `stop`ped, per the policy above | reboot the box, then `docker compose ps` — all should be `Up` |
| GitHub runner survives reboot | Installed as a systemd service (`svc.sh install`) | `systemctl is-enabled actions.runner.*` → `enabled` |
| Tunnel survives reboot | `cloudflared` is itself a `restart: unless-stopped` container | same `docker inspect` check |

Optional real-world test: `sudo reboot`, wait ~1 min, then confirm
`https://finbook.online` loads with no manual intervention.

## 8. Viewing logs — Grafana runs on your Mac, not the box

The production box is a `t3.micro` (908MB RAM total) — too tight to also run
Grafana alongside db+api+web+backup-tool+loki+promtail. Grafana instead runs
**locally**, wherever you're doing ops from, and queries Loki on the box
remotely over Tailscale (Loki's port is bound to `${TAILSCALE_IP}` only —
unreachable from the public internet regardless of the AWS security group).

```bash
mkdir -p ~/.finbook-grafana/provisioning/datasources ~/.finbook-grafana/data
cat > ~/.finbook-grafana/provisioning/datasources/loki.yml <<'EOF'
apiVersion: 1
datasources:
  - name: Loki (FinBook AWS)
    type: loki
    access: proxy
    url: http://100.99.22.48:3100   # the box's Tailscale IP
    isDefault: true
    editable: true
EOF
cat > ~/.finbook-grafana/docker-compose.yml <<'EOF'
name: finbook-grafana-local
services:
  grafana:
    image: grafana/grafana:10.4.3
    container_name: finbook-grafana-local
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: "false"
    ports:
      - "127.0.0.1:3001:3000"   # 3000 was already taken locally; adjust if free
    volumes:
      - ./data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning:ro
EOF
cd ~/.finbook-grafana && docker compose up -d
```
Open `http://localhost:3001` (default admin/admin, change it). Your Mac
needs Tailscale running and joined to the same tailnet as the box — no other
setup needed, the datasource is pre-provisioned.

> **Promtail must be `>= 3.0`.** Version `2.9.x`'s bundled Docker client only
> speaks API 1.42 and silently fails to discover any containers against a
> modern Docker daemon ("client version 1.42 is too old") — container logs
> never actually reach Loki with 2.9.x, only host journal/syslog does.
> Setting `DOCKER_API_VERSION` as an env var does **not** fix this on 2.9.x;
> the fix is the image version (already `3.1.0` in the compose file).

## Cutover checklist (Pi → AWS)
- [ ] Box up on Tailscale as 100.99.22.48, Docker installed + enabled on boot
- [ ] `.env` filled with real secrets (`chmod 600`)
- [ ] Cloudflare tunnel token in `.env`, hostnames routed
- [ ] `docker compose up -d` green, `finbook.online` loads
- [ ] **Migrate data**: restore the latest Pi DB dump via the backup tool UI
      (`http://localhost:4100` over an SSH/Tailscale tunnel) or `mysql < dump.sql`,
      and copy the Pi's `api_uploads` volume contents to the AWS one
- [ ] Runner registered (label `aws_fin`), installed as a service, `DEPLOY_PATH` secret set
- [ ] Stop/remove the Pi's runner so only one box ever deploys
- [ ] Reboot test passed (section 7)
- [ ] Point `finbook.online` DNS at the new tunnel; retire the old `*.sivaprj.online` subdomains
