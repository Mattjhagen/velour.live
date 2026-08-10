# Step 5 — Containerized apps

```text
Add support for Dockerfile deployments and Node applications that expose one
HTTP port. Each live deployment runs as a non-root container with read-only
filesystem where possible, dropped Linux capabilities, resource limits, health
checks, and a private network. Do not allow arbitrary host mounts, host
networking, privileged mode, or Docker socket access.
```

**Done when:** a basic Node HTTP app deploys, passes health checks, streams
logs, restarts after a failure, and its removal cannot affect another project.
