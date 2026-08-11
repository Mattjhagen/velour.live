# Velour — R510 Server Rollout Runbook

> Follow one checkpoint at a time. **Do not expose the service publicly until the
> security review (`docs/security-review.md`) P1 and P2 findings are resolved.**

---

## Pre-requisites

- [ ] Dell R510 running Ubuntu 24.04 LTS
- [ ] Docker Engine 27+ and Docker Compose v2 installed
- [ ] `git`, `make`, `openssl`, `jq` available
- [ ] Tailscale installed and connected to your tailnet
- [ ] Cloudflare managing DNS for `velour.live`
- [ ] Cloudflare API token with `Zone:DNS:Edit` scope for `velour.live`

---

## 1. Service account

```bash
# Create a low-privilege user to run Velour
sudo useradd --system --shell /usr/sbin/nologin --home /var/lib/velour velour
sudo mkdir -p /var/lib/velour/{artifacts,sites}
sudo chown -R velour:velour /var/lib/velour
sudo chmod 750 /var/lib/velour/artifacts /var/lib/velour/sites

# Allow velour to use Docker without root (add to docker group)
sudo usermod -aG docker velour
```

---

## 2. Firewall policy

```bash
# Allow only SSH (Tailscale) and HTTPS; block everything else inbound.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0   # Tailscale admin access
sudo ufw allow 443/tcp            # HTTPS (Caddy)
sudo ufw allow 80/tcp             # HTTP → redirected to HTTPS by Caddy
sudo ufw enable
```

**Checkpoint:** Verify `sudo ufw status` shows the above rules and nothing else.

---

## 3. Tailscale-only administration

All SSH and Caddy Admin API access is restricted to the Tailscale network.
Never expose port 22 or 2019 to the public internet.

```bash
# Bind SSH to Tailscale interface only
# In /etc/ssh/sshd_config:
ListenAddress <tailscale-ip>

sudo systemctl restart ssh
```

**Checkpoint:** SSH works from a Tailscale-connected device; fails from a non-Tailscale IP.

---

## 4. Clone the repository

```bash
sudo -u velour git clone https://github.com/Mattjhagen/velour.live.git \
  /var/lib/velour/app
cd /var/lib/velour/app
```

---

## 5. Secrets management

Generate and store all secrets **before** starting the stack. Never commit
secrets to version control.

```bash
cd /var/lib/velour/app

# Generate secrets
POSTGRES_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
VELOUR_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Write to /var/lib/velour/.env (not in repo directory)
cat > /var/lib/velour/.env <<EOF
# Postgres
POSTGRES_USER=velour
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=velour
DATABASE_URL=postgresql://velour:${POSTGRES_PASSWORD}@postgres:5432/velour

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# Next-Auth (GitHub OAuth)
GITHUB_CLIENT_ID=<from GitHub OAuth App>
GITHUB_CLIENT_SECRET=<from GitHub OAuth App>
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://velour.live
VELOUR_ADMIN_EMAIL=<your GitHub email>

# Encryption
VELOUR_ENCRYPTION_KEY=${VELOUR_ENCRYPTION_KEY}

# Caddy TLS (DNS-01)
CLOUDFLARE_API_TOKEN=<Cloudflare API token>
VELOUR_ACME_EMAIL=<your email>

# Domain
VELOUR_DOMAIN=velour.live
EOF

chmod 600 /var/lib/velour/.env
```

**Checkpoint:** `.env` exists at `/var/lib/velour/.env`, readable only by root and velour.

---

## 6. DNS configuration

In Cloudflare DNS for `velour.live`:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `velour.live` | `<server-public-IP>` | ☁️ Proxied |
| A | `www` | `<server-public-IP>` | ☁️ Proxied |
| A | `*` | `<server-public-IP>` | ☁️ Proxied |

Set SSL/TLS mode to **Full (strict)** in Cloudflare.

**Checkpoint:** `dig velour.live @1.1.1.1` resolves to your server IP.

---

## 7. Build Caddy with DNS plugin

The production Caddyfile requires the Cloudflare DNS plugin for wildcard TLS.

```bash
# On the server, build a custom Caddy binary
docker run --rm -v /usr/local/bin:/output caddy:builder \
  xcaddy build --with github.com/caddy-dns/cloudflare \
  --output /output/caddy-custom

# Verify
/usr/local/bin/caddy-custom version
```

Update `compose.yaml` to use `caddy-custom` image or mount the binary into the
standard Caddy container.

**Checkpoint:** `caddy-custom` binary exists and prints a version ≥ 2.8.

---

## 8. Run database migrations

```bash
cd /var/lib/velour/app
docker compose --env-file /var/lib/velour/.env up -d postgres
sleep 5  # wait for Postgres to be ready

docker compose --env-file /var/lib/velour/.env run --rm worker \
  tsx packages/db/migrate.ts

docker compose --env-file /var/lib/velour/.env logs worker | tail -20
```

**Checkpoint:** Migration output shows all 4 migrations applied without error.

---

## 9. Start the stack

```bash
cd /var/lib/velour/app

# Use the production Caddyfile
cp infra/caddy/Caddyfile.prod infra/caddy/Caddyfile.current

docker compose \
  --env-file /var/lib/velour/.env \
  -f compose.yaml \
  up -d

docker compose ps
```

**Checkpoint:** All services show `healthy` or `running`.

---

## 10. Smoke test

```bash
# Health check
curl -f https://velour.live/api/health

# Dashboard loads
curl -I https://velour.live
```

**Checkpoint:** Health endpoint returns `{"status":"ok"}` and dashboard returns HTTP 200.

---

## 11. Encrypted backup setup

```bash
# Install restic for encrypted off-server backups
sudo apt install restic

# Initialise a backup repository (e.g. SFTP remote or B2 bucket)
restic -r sftp:backup-host:/velour init

# Backup script at /etc/cron.d/velour-backup:
0 3 * * * velour /usr/local/bin/velour-backup.sh >> /var/log/velour-backup.log 2>&1
```

`/usr/local/bin/velour-backup.sh`:
```bash
#!/bin/bash
set -e
source /var/lib/velour/.env.backup  # contains RESTIC_PASSWORD, RESTIC_REPOSITORY

docker exec velour-postgres-1 pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | restic backup --stdin --stdin-filename velour.sql

restic backup /var/lib/velour/artifacts /var/lib/velour/sites

restic forget --prune --keep-daily 7 --keep-weekly 4 --keep-monthly 3
```

**Checkpoint:** Run manually; verify `restic snapshots` shows a new entry.

---

## 12. Monitoring

```bash
# Basic container health monitoring via systemd
cat > /etc/systemd/system/velour-watchdog.service <<'EOF'
[Unit]
Description=Velour stack watchdog
After=docker.service

[Service]
Type=oneshot
User=velour
ExecStart=/usr/bin/docker compose -f /var/lib/velour/app/compose.yaml ps --format json
EOF

# Or use Uptime Kuma (self-hosted) monitoring /api/health
```

---

## Update procedure

```bash
cd /var/lib/velour/app
git pull origin main

# Apply any new migrations
docker compose --env-file /var/lib/velour/.env run --rm worker tsx packages/db/migrate.ts

# Rolling restart
docker compose --env-file /var/lib/velour/.env up -d --no-deps dashboard worker
```

---

## Rollback procedure

If a deployment breaks the stack:

```bash
cd /var/lib/velour/app
git log --oneline -10              # find the last good commit
git checkout <commit>              # pin to it
docker compose up -d --no-deps dashboard worker
```

For a single project rollback, use the dashboard's Rollback button on the
deployments page.

---

## Pre-launch security checklist

- [ ] P1 Docker socket proxy configured
- [ ] P2 Metadata IP blocked at iptables level
- [ ] P2 `outputDir` path containment check applied
- [ ] P2 Webhook delivery deduplication in Redis
- [ ] Backup tested with a restore on a clean machine
- [ ] Cloudflare SSL set to Full (strict)
- [ ] SSH restricted to Tailscale interface
- [ ] Firewall rules verified
- [ ] `NEXTAUTH_SECRET` present in `.env`
- [ ] Admin email allowlist set (`VELOUR_ADMIN_EMAIL`)
- [ ] Security review signed off

**Do not proceed past this point until every box is checked.**
