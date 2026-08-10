# Velour — Tomorrow's Work

## Immediate: Verify Step 2 Deploy

The migrations-path fix was just committed but not yet confirmed working on the R510.

- [ ] On R510: `git pull && docker compose up -d --build`
- [ ] Check logs: `docker compose logs dashboard --tail 30`
  - Look for: migration success (no "Can't find meta/_journal.json" error)
  - Look for: `✓ Ready` with no unhandledRejection
- [ ] Confirm health endpoint still passes: `curl -s http://100.103.3.35/api/health`
  - Expected: `{"status":"ok","postgres":true,"redis":true}`

---

## Step 3 — Static-Site Deployment Worker

Build the core of Velour: accept a zip/tarball of a built static site, unpack it,
serve it from Caddy, track state through the deployment machine.

### Plan (propose before implementing)

- API route `POST /api/projects/:slug/deploy` — accepts multipart upload or GitHub ref
- Worker spawns an **ephemeral, unprivileged** Docker container:
  - Non-root user, read-only root filesystem
  - CPU limit: 0.5 cores, memory: 256 MB, pids: 64
  - No network access during build (static sites don't need it)
  - 5-minute build timeout; killed if exceeded
- Deployment state transitions: `queued → building → deploying → live`
  - On any failure: transition to `failed`, persist error in `build_logs`
- Build logs streamed line-by-line to `build_logs` table (for later SSE endpoint)
- On success: atomically swap the Caddy serve root for the slug
- Rollback: re-point Caddy to the previous artifact

### Containment controls to state before implementing

Per CLAUDE.md rules, write down the threat model and containment controls
before any public routing or execution code lands.

---

## Step 4 — Caddy Routing & Wildcard TLS

Route `<slug>.velour.live` → correct deployment artifact.

- [ ] Obtain a wildcard cert for `*.velour.live` via Caddy + ACME DNS challenge
  - Decide DNS provider (Cloudflare recommended — has native Caddy plugin)
  - Add `CLOUDFLARE_API_TOKEN` (or equivalent) to `.env` and `compose.yaml`
- [ ] Caddyfile: `*.velour.live { ... }` with `header_upstream Host {labels.2}`
- [ ] Slug validation enforced at routing layer (reserved words, format regex)
- [ ] Test: deploy a hello-world static site, verify it appears at `<slug>.velour.live`
- [ ] Test: reserved slug (`api`, `dashboard`, etc.) is rejected, not routed

---

## Step 5 — Container Web Services

Support Dockerfile-based deployments (not just static sites).

- [ ] Detect `Dockerfile` in uploaded repo
- [ ] Build image inside a builder container (Docker-in-Docker **not** allowed —
      use Buildah or Kaniko rootless instead)
- [ ] Run result as non-root, with CPU/memory/pids/tmpfs limits
- [ ] No host networking, no Docker socket, no privileged mode
- [ ] Reverse-proxy from Caddy slug route → container internal port
- [ ] Health-check loop before marking deployment `live`
- [ ] Stop old container after new one is healthy (zero-downtime swap)

---

## Step 6 — GitHub App Integration

Trigger deployments automatically on push.

- [ ] Create GitHub App (not OAuth App) — install on user's repo
- [ ] Webhook endpoint `POST /api/webhooks/github`
  - Verify `X-Hub-Signature-256` — **reject anything that doesn't verify**
  - Accept only `push` events to the configured default branch
- [ ] Pin deployment to exact commit SHA (never deploy "latest")
- [ ] Store GitHub App private key encrypted with `VELOUR_ENCRYPTION_KEY`
- [ ] Tests: webhook signature verification (valid, invalid, missing, replay)

---

## Step 7 — Production Security Review

- [ ] Run `docker compose config` — confirm no service exposes a host port except Caddy 80/443
- [ ] Confirm Postgres and Redis have no published ports
- [ ] Audit all `environment:` blocks — no secrets visible in `docker inspect`
  - Use Docker secrets or env-file mounts instead of plain env vars if possible
- [ ] Review Next.js API routes — every route must call `getServerSession` and
      scope all DB queries to `session.user.id`
- [ ] Dependency audit: `pnpm audit --prod`
- [ ] Check CSP headers in Caddyfile

---

## Step 8 — R510 Server Rollout Runbook

Write a repeatable, idempotent runbook for bringing up Velour on a fresh server.

- [ ] Prerequisites section (Docker, git, Tailscale, ports 80/443 open)
- [ ] Clone, `.env` population, `docker compose up -d`
- [ ] DNS setup (Cloudflare A record, wildcard CNAME)
- [ ] First-login walkthrough (GitHub OAuth → admin email guard)
- [ ] Backup strategy for Postgres volume
- [ ] Upgrade procedure: `git pull && docker compose up -d --build`
- [ ] Rollback procedure: `docker compose down && git checkout <prev-sha> && docker compose up -d --build`

---

## Deferred / Nice-to-Have

- Dashboard UI: project list, deployment history, log viewer (SSE stream)
- Environment variable UI: encrypt on save, never expose plaintext in API responses
- Custom domain support: user brings their own domain, Caddy gets-cert for it
- Usage limits per project (disk, bandwidth, request rate)
- Multi-project isolation tests: confirm project A cannot read project B's files

---

## Notes

- All commands must be labeled **[MAC]** or **[R510]**
- Never expose R510 publicly — Tailscale IP `100.103.3.35` only for admin
- Caddy is the only public ingress — Postgres/Redis must never have host ports
- Workloads run as non-root with bounded CPU, memory, pids, and disk
- Deployment state machine: `queued → building → (failed|deploying) → live → (stopped|rolled_back)`
