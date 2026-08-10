# Step 3 — Static-site deployments

```text
Build v1 deployment execution only for static output. A deployment worker must
build in an ephemeral unprivileged container with CPU, memory, process,
network, and timeout limits; then publish only the generated static directory.
Add streamed logs, failure handling, deployment history, and rollback. Before
coding, identify Docker isolation risks in this design and propose mitigations.
```

**Done when:** a pinned source commit creates a static artifact, live build
logs appear in the dashboard, and rollback restores the last known-good
artifact without rebuilding.
