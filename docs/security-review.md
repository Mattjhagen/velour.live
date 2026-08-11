# Velour — Production Security Review

> **Status:** Pre-launch audit. No remediation may be applied to production until
> this document is signed off. Findings are prioritised P1 (critical) → P4 (low).

---

## Scope

Single-server self-hosted PaaS running on a Dell R510 behind Cloudflare.
Services: Next.js dashboard, Redis queue, Postgres, build worker (Docker-in-Docker via socket), Caddy reverse proxy.

Reviewed: authorisation, secrets, SSRF, webhook verification, path traversal,
container escapes, Caddy routing, TLS, backup/restore, logging, rate limiting.

---

## P1 — Critical

### 1. Docker socket exposure in worker container

**Finding:** The worker mounts `/var/run/docker.sock`. A container escape in the
worker (or a malicious build command) gives root on the host.

**Mitigations already in place:**
- Build containers run with `CapDrop: ALL`, `SecurityOpt: no-new-privileges`,
  isolated per-build bridge networks with no access to `control-plane`.
- Build containers have no bind-mount access to the Docker socket.
- `PidsLimit: 256`, memory cap 512 MiB, CPU quota 100 %.

**Remaining risk:** The worker process itself has full Docker API access. A bug
in `build.ts` or `container.ts` that passes user-supplied data into
`createContainer` could escalate.

**Recommendation:** Run the worker behind a Docker socket proxy
(e.g. `tecnativa/docker-socket-proxy`) that whitelists only the API methods the
worker needs (`/containers/*`, `/networks/*`, `/images/*`, `/build`).

---

### 2. `repoUrl` SSRF via git clone

**Finding:** `git clone --depth 1 "${project.repoUrl}" /src` runs inside a build
container. A repo URL like `file:///etc/passwd` or
`http://169.254.169.254/latest/meta-data/` would be cloned from inside the
build network, which has internet access.

**Mitigations in place:**
- Build containers use an isolated bridge network separate from `control-plane`.
- URL validation in `actions.ts` requires `https://` or `git@` prefix.

**Remaining risk:** `git@` URLs could be used to exfiltrate SSH keys if the
build container had them mounted (it does not). Cloud metadata endpoints
(169.254.169.254) are reachable from the build network.

**Recommendation:**
1. Block metadata IP ranges at the Docker network level (iptables rule added in
   `compose.yaml` or via a `docker network create --opt` no-icc rule).
2. Validate that the host portion of `repoUrl` is a public git forge, or allow
   an allowlist.

---

## P2 — High

### 3. Path traversal in `outputDir`

**Finding:** The build script replaces `..` with `""` and strips leading `/`:
```ts
const safeOutputDir = project.outputDir.replace(/\.\./g, "").replace(/^\//, "");
```
The pattern `...` would survive (triple dot), and `./foo` is fine but
`....//etc` collapses to `//etc` after stripping `..`.

**Recommendation:** Replace the ad-hoc sanitisation with a path-containment check:
```ts
const resolved = path.resolve("/src", outputDir);
if (!resolved.startsWith("/src/")) throw new Error("outputDir escape");
```

### 4. Webhook replay attacks

**Finding:** `X-GitHub-Delivery` is logged but not persisted. A delivery ID that
is replayed after the deduplication window (currently: if the commitSha already
has a deployment) could create duplicate deployments if the same commit is
re-pushed by force-push.

**Recommendation:** Store `deliveryId` in a Redis set with a 24-hour TTL and
reject duplicates before hitting the database.

### 5. Caddy wildcard serving unverified slugs

**Finding:** Caddy serves any directory name that appears in
`/var/lib/velour/sites/`. If a symlink is created by an attacker who controls
the filesystem (e.g., via a container escape), they could serve arbitrary
content.

**Mitigation in place:** Only the worker process creates symlinks; app containers
have no host filesystem access.

**Recommendation:** Restrict the sites directory to `0750 velour:velour` and run
the worker as that dedicated user.

---

## P3 — Medium

### 6. Encryption key rotation

**Finding:** `VELOUR_ENCRYPTION_KEY` is a static AES-256-GCM key. If it leaks,
all stored environment variable values are exposed. There is no key rotation
path.

**Recommendation:** Add a `velour secrets rotate` CLI command that re-encrypts
all `environment_variables` rows with a new key before updating the env var.

### 7. Rate limiting absent

**Finding:** No rate limit on `POST /api/projects/*/deployments`,
`POST /api/github/webhook`, or auth callbacks. An attacker with a valid session
could queue thousands of builds, exhausting disk and CPU.

**Recommendation:** Add Next.js middleware rate limiting (e.g. `rate-limiter-flexible`
with Redis backend) — 10 deploys/minute per user, 5 webhook deliveries/minute
per project.

### 8. Build log injection

**Finding:** `log()` strips ANSI and non-printable characters. However, very
long lines (> 64 KB) are not truncated before DB insertion, which could bloat
the `build_logs` table.

**Recommendation:** Truncate lines at 4 096 characters in `log()`.

### 9. Missing `finishedAt` on rollback

**Finding:** `rollbackDeployment` sets a deployment to `live` but does not set
`finishedAt`. The field is used for display in the dashboard.

**Recommendation:** Set `finishedAt: new Date()` when promoting a rolled-back
deployment to live.

---

## P4 — Low

### 10. Health endpoint leaks dependency status

**Finding:** `GET /api/health` returns `{ postgres: bool, redis: bool }` with no
authentication. An attacker can determine which backing services are down.

**Recommendation:** Either add an internal-only header check, or remove the
per-service breakdown from the public response.

### 11. NEXTAUTH_SECRET not validated at startup

**Finding:** If `NEXTAUTH_SECRET` is missing, Next-Auth falls back to a derived
secret in some versions. Sessions may be valid across deployments unintentionally.

**Recommendation:** Add a startup assertion: `if (!process.env.NEXTAUTH_SECRET) throw`.

### 12. Container app log streaming not implemented

**Finding:** `runContainerApp` writes build logs during the clone/install phase
but does not stream runtime logs from the running container. The dashboard shows
nothing after `=== Container app is live ===`.

**Recommendation:** Implement a periodic log collector in the worker that reads
`container.logs({ follow: true })` and writes to `build_logs` (or a new
`runtime_logs` table).

---

## Backup & Restore

### Procedure (to be tested before launch)

1. **Postgres dump:**
   ```bash
   docker exec velour-postgres-1 pg_dump -U velour velour | gzip \
     > /mnt/backup/velour-$(date +%Y%m%d).sql.gz
   ```
2. **Artifacts backup:**
   ```bash
   tar -czf /mnt/backup/artifacts-$(date +%Y%m%d).tar.gz \
     /var/lib/velour/artifacts /var/lib/velour/sites
   ```
3. **Restore test:**
   - Spin up a second Postgres container with the dump.
   - Start the stack against the restored DB.
   - Verify that deploying a known project produces the same artifact.

**Status:** ❌ Not yet tested. Must pass before public launch.

---

## TLS

- Development: Cloudflare tunnel (`cloudflared`) terminates TLS; Caddy uses
  `auto_https off` and operates HTTP-only internally. ✅
- Production: Caddy handles TLS with DNS-01 wildcard cert via Cloudflare API.
  Requires `Caddyfile.prod` and the `caddy-dns/cloudflare` plugin. ✅ (config ready)
- HSTS: enforced at Cloudflare edge. Verify "Full (strict)" SSL mode is set.

---

## Approval

This document must be reviewed and signed before any of the P1/P2 findings are
disclosed publicly or before the service receives external traffic.

| Reviewer | Role | Signature | Date |
|----------|------|-----------|------|
|          |      |           |      |
