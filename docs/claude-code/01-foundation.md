# Step 1 — Foundation

Start with this prompt:

```text
Inspect this repository. Propose a monorepo layout for Velour: dashboard/API,
deployment worker, shared types, Docker Compose, Postgres, Redis, Caddy, and
documentation. Do not implement yet.
```

After reviewing and approving the proposed layout, use:

```text
Implement the approved foundation. Add a Next.js dashboard with a health
endpoint, Postgres and Redis services, Caddy reverse proxy, local development
instructions, and a CI workflow that runs lint, typecheck, and tests. Do not
implement deployment execution yet.
```

**Done when:** the dashboard health endpoint, Compose stack, and CI checks work
locally without public routing or application deployment execution.
