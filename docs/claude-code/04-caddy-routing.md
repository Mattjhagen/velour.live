# Step 4 — Caddy routing

```text
Implement domain routing so a project may receive project-slug.velour.live.
Caddy must be the only public ingress. Generate route configuration from
verified deployment state, validate project slugs strictly, and test that one
project cannot route to another project's deployment.
```

**Done when:** only a verified `live` deployment can receive traffic and a
project cannot claim another project's hostname.
