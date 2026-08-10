# Step 6 — GitHub integration

```text
Design then implement GitHub App webhook handling. A push to main should
create a production deployment. Verify webhook signatures, deduplicate
deliveries, record the immutable commit SHA, and show deployment status in the
dashboard.
```

**Done when:** a correctly signed push produces exactly one deployment for its
commit SHA and invalid or duplicate webhook deliveries are rejected safely.
