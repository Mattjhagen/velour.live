# Velour

**A self-hosted deployment platform for one trusted server.**

Velour turns a repository into a running HTTPS application: it builds code in
an isolated worker, records deployment state and logs, and routes a domain to
the active deployment. It is intentionally not a clone of every Vercel,
Netlify, or Render feature.

## v1 outcome

The first usable release lets one administrator deploy a static site to
`<project>.velour.live`, see its build output, and roll back to the previous
successful release.

## Architecture

```text
GitHub push / manual deploy
          |
  Velour dashboard and API  -> Postgres (state)
          |                 -> Redis (jobs)
          v
   isolated build worker -> deployment artifact
          v
      Caddy ingress -> project.velour.live
```

## Repository layout

This initial commit establishes the operating contract and local infrastructure
baseline. Application packages will be added in the first implementation
milestone.

- `docs/implementation-plan.md` — sequenced build plan and acceptance criteria
- `docs/claude-code/` — eight small, ordered Claude Code implementation prompts
- `CLAUDE.md` — instructions for Claude Code contributors
- `compose.yaml` — local Postgres, Redis, and Caddy foundation
- `infra/caddy/Caddyfile` — development ingress placeholder

## Local foundation

1. Install Docker Engine / Docker Desktop and Docker Compose.
2. Copy `.env.example` to `.env` and replace the development-only passwords.
3. Start the foundation:

   ```sh
   docker compose up -d
   ```

4. Confirm the ingress is available at `http://localhost`.

The current Caddy route is deliberately a health placeholder. It must not be
exposed to the public internet as a production deployment service.

## Non-negotiable security model

User repositories are untrusted code. Builds and deployed workloads must never
receive the Docker socket, host networking, privileged mode, host mounts, or
unbounded resources. Caddy is the only public ingress; Postgres and Redis stay
on private networks. See the implementation plan before adding deployment
execution.

## Domains

The intended public layout is:

- Dashboard: `app.velour.live`
- Deployments: `<project>.velour.live`
- API: `api.velour.live`

Use a wildcard DNS record and DNS-01 TLS validation when moving from local
development to the homeserver.
