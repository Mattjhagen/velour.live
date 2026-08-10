# Step 7 — Production review

```text
Perform a security and operations review of Velour as if it will be reachable
from the public internet. Check authorization, secrets, SSRF, webhook
verification, path traversal, container escapes, Caddy routing, TLS, backup /
restore, logging, and rate limiting. Produce findings first; make no changes
until I approve.
```

**Done when:** there is a prioritized, evidence-backed finding list with a
tested backup/restore path and explicit approval before remediation changes.
