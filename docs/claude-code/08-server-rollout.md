# Step 8 — Server rollout

```text
Create a production rollout runbook for a single homeserver. Include a
low-privilege service account, firewall policy, Tailscale-only administration,
off-machine encrypted backups, wildcard DNS and DNS-01 TLS for velour.live,
secret provisioning outside git, monitoring, updates, rollback, and a final
exposure checklist. Do not execute any external infrastructure change.
```

**Done when:** the runbook can be followed one verified checkpoint at a time
and no public exposure occurs before the security review is resolved.
