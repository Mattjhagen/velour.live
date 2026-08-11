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

### 4. Webhook replay attacks ✅ FIXED

`X-GitHub-Delivery` is now stored as `velour:delivery:{id}` in Redis with a
24-hour TTL using `SET … EX 86400 NX`. Replays are rejected before the DB is
touched. DB-level dedup on `(projectId, commitSha)` remains as a second layer.

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

### 7. Rate limiting ✅ FIXED

Redis fixed-window counters in `lib/rate-limit.ts`:
- `POST /api/github/webhook`: 20/min per project slug
- `POST /api/projects/*/deployments`: 10/min per user ID
Both return `429` with `Retry-After: 60` when exceeded.

### 8. Build log injection ✅ FIXED

`log()` in both `build.ts` and `container.ts` strips ANSI escape codes,
removes non-printable characters, and truncates to 4 096 chars before DB insert.

### 9. Missing `finishedAt` on rollback ✅ FIXED

`rollbackDeployment` now sets `finishedAt: new Date()` when promoting a
deployment to `live`.

---

## P4 — Low

### 10. Health endpoint leaks dependency status ✅ FIXED

`GET /api/health` now returns only `{ status: "ok" | "degraded" }`. Per-service
detail has been removed from the public response.

### 11. NEXTAUTH_SECRET not validated at startup ✅ FIXED

`apps/dashboard/instrumentation.ts` registers a startup hook that throws if any
of `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `VELOUR_ENCRYPTION_KEY`, `DATABASE_URL`,
`REDIS_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, or `VELOUR_ADMIN_EMAIL`
is missing. The process will not start.

### 12. Container app log streaming ✅ FIXED

`streamRuntimeLogs()` in `container.ts` attaches to the running container's
stdout/stderr via `container.logs({ follow: true })` after the container goes
live and writes each line to `build_logs` with a `[runtime]` prefix. Runs as
a detached async task so it never blocks the queue loop.

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
