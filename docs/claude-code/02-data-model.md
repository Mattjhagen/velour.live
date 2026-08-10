# Step 2 — Data model

```text
Implement the Postgres schema and migration for users, projects, domains,
deployments, build logs, and deployment environment variables. Use explicit
states: queued, building, failed, deploying, live, stopped, rolled_back. Add
authorization tests.
```

**Done when:** migrations apply cleanly and tests prove users cannot read or
change another user's project or deployment.
