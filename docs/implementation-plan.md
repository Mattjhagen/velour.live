# Velour implementation plan

## Product boundary

Velour v1 is a single-administrator platform for deploying static sites and
HTTP applications to one homeserver. It provides projects, deployments,
build logs, HTTPS routing, and rollback. It does not initially provide teams,
billing, globally distributed execution, arbitrary serverless functions, or
managed databases for tenants.

## Milestone 0 — server foundation

Provision a patched Debian or Ubuntu server, a non-login `velour` service
account, firewall rules, off-machine encrypted backups, and an administrator
VPN such as Tailscale. Configure `velour.live` DNS but keep the control plane
private until authentication and backups are verified.

**Acceptance:** Caddy is the sole public listener; Postgres and Redis are not
reachable from the public network; a restore drill succeeds.

## Milestone 1 — control plane

Build a TypeScript dashboard/API with GitHub OAuth and a Postgres schema for
users, projects, domains, deployments, immutable commit identifiers, encrypted
environment variables, and append-only logs. Add Redis-backed jobs and an
audited deployment state machine.

**Acceptance:** an administrator can create a project and manually enqueue a
deployment; unauthorized users cannot read or mutate it.

## Milestone 2 — static deployments

Implement an ephemeral build worker that checks out a pinned commit and runs a
strictly allowlisted static-site build. Publish only the generated artifact.
Store build output with redaction and present it in the dashboard.

**Acceptance:** a static project deploys to a unique internal route, preserves
previous releases, and can roll back without rebuilding.

## Milestone 3 — public HTTPS routing

Generate Caddy configuration from verified live-deployment records. Enable
wildcard `*.velour.live` TLS with DNS-01 validation. Validate project slugs and
custom-domain ownership; ensure all route mutations are authorized.

**Acceptance:** `project.velour.live` serves only its active deployment,
receives a valid certificate, and a project cannot claim another project's
hostname.

## Milestone 4 — container web services

Support a narrow Dockerfile contract or a small set of buildpacks. Launch each
deployment as a non-root container on a private network with a read-only root
filesystem where viable, dropped capabilities, resource limits, health checks,
and no access to Docker, host services, or arbitrary host files.

**Acceptance:** a Node HTTP service can deploy, restart after failure, stream
logs, and be removed without affecting another project.

## Milestone 5 — GitHub automation

Replace development credentials with a GitHub App. Verify webhook signatures,
deduplicate event IDs, pin each deployment to its commit SHA, and deploy `main`
to production. Add preview deployments only after production routing is solid.

**Acceptance:** a signed GitHub push triggers exactly one tracked deployment
and exposes the resulting status to GitHub.

## Milestone 6 — operational hardening

Add rate limits, alerts, audit logs, image/artifact retention, quotas,
encrypted secret handling, dependency patching, monitoring, backup automation,
and recovery documentation. Commission an external security review before
accepting repositories from anyone beyond the administrator.

## Required threat-model checkpoints

Before Milestones 2–4, document mitigations for build escape, malicious image
content, secret exfiltration, SSRF, path traversal, routing takeover, webhook
forgery, denial of service, and container breakout. Docker alone is not a
strong multi-tenant boundary; treat this as a trusted-admin system until a
stronger sandbox runtime is proven.
