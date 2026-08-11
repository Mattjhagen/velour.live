# Velour — Work Log

## Completed

### Step 2 — Verify Deploy (pending R510 confirmation)
- [ ] On R510: `git pull && docker compose up -d --build`
- [ ] Check logs: `docker compose logs dashboard --tail 30`
- [ ] Confirm health endpoint: `curl -s http://100.103.3.35/api/health`
  - Expected: `{"status":"ok"}`

### Steps 3–8 ✅
All implemented. See `docs/security-review.md` and `docs/runbook.md`.

---

## Security Hardening (in progress)

### ✅ Webhook replay protection
- Delivery ID stored in Redis with 24h TTL — replays rejected before DB hit.

### ✅ Rate limiting
- `/api/github/webhook`: 20/min per project slug (Redis fixed-window)
- `/api/projects/*/deployments` POST: 10/min per user session

### ✅ Health endpoint
- `/api/health` returns `{"status":"ok"|"degraded"}` only — no per-service breakdown.

### ✅ Startup env var validation
- `instrumentation.ts` throws on startup if any required variable is missing.

### ✅ Container runtime log streaming
- Worker tails running container stdout/stderr into `build_logs` with `[runtime]` prefix.

### ✅ compose.yaml hardening
- Caddy added to `control-plane` network so worker can reach Admin API.
- Worker gets `INGRESS_NETWORK`, `CADDY_ADMIN_URL`, `VELOUR_DOMAIN` via environment.
- Explicit Docker network names (`velour_ingress`, `velour_control-plane`) — no project-prefix ambiguity.

---

## Outstanding Security Findings (from security-review.md)

### P1 — Needs infrastructure decision before implementing
- **Docker socket proxy**: Replace raw socket mount with `tecnativa/docker-socket-proxy`.
  Requires compose.yaml change + worker config to point at proxy.
- **SSRF / metadata IP block**: Add iptables rule to deny 169.254.169.254 from build networks.
  Requires R510 host-level config or `docker network create --opt com.docker.network.bridge.inhibit_snat=true`.

### P2 — Done ✅ (delivery ID dedup)

### P3 — Done ✅ (rate limiting)

### P4 — Done ✅ (health endpoint, startup validation, runtime logs)

---

## Nice-to-Have / Future

- Docker socket proxy (P1 security)
- Metadata IP block at iptables level (P1 security)
- Encryption key rotation CLI (`velour secrets rotate`)
- Custom domain UI: user brings own domain, Caddy gets cert for it
- Usage limits per project (disk, bandwidth, request rate)
- Multi-project isolation tests: confirm project A cannot read project B files
- SSE log streaming endpoint for live build log tail in dashboard
