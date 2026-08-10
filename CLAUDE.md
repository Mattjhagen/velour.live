# Velour contributor instructions

Velour is a single-server, self-hosted PaaS. Optimize for an understandable,
secure deployment path before adding platform breadth.

## Rules

- Inspect the repository and propose a small plan before each feature.
- Never print, commit, or log credentials, deployment secrets, or webhook
  tokens.
- Treat every application build and runtime as hostile code.
- Caddy is the only public ingress. Databases, queues, registry services, and
  deployment containers must not publish host ports.
- Never grant a workload the Docker socket, host networking, privileged mode,
  host PID/IPC namespaces, or arbitrary host volume mounts.
- Run workloads as non-root with bounded CPU, memory, process count, disk use,
  build time, and network access.
- Use explicit deployment states: `queued`, `building`, `failed`,
  `deploying`, `live`, `stopped`, and `rolled_back`.
- Add tests for authorization, webhook-signature verification, routing
  isolation, and deployment-state transitions.
- Keep v1 single-server. Do not introduce Kubernetes or a multi-node scheduler.

## Before implementing public routing or execution

State the threat model and describe the containment controls being added. If a
requirement would weaken a rule above, stop and request an explicit decision.
