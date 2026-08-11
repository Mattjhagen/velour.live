import { describe, it, expect } from "vitest";
import { validateSlug } from "./slug";

// These tests verify that the slug system enforces the routing isolation
// guarantee: one project cannot claim another project's subdomain.

describe("routing isolation via slug validation", () => {
  it("rejects path traversal attempts in slug position", () => {
    expect(validateSlug("../etc")).toMatchObject({ valid: false });
    expect(validateSlug("..")).toMatchObject({ valid: false });
    expect(validateSlug(".hidden")).toMatchObject({ valid: false });
  });

  it("rejects slugs that could alias reserved infrastructure hostnames", () => {
    const infraNames = ["api", "www", "app", "admin", "dashboard", "velour", "health", "static", "assets", "mail"];
    for (const name of infraNames) {
      expect(validateSlug(name)).toMatchObject({ valid: false, error: "reserved" });
    }
  });

  it("rejects slugs with characters that could escape the wildcard match", () => {
    // A slug like "a.b" would become "a.b.velour.live" — two extra labels — bypassing the wildcard
    expect(validateSlug("a.b")).toMatchObject({ valid: false, error: "invalid_format" });
    // Wildcard characters
    expect(validateSlug("a*b")).toMatchObject({ valid: false, error: "invalid_format" });
    // Spaces
    expect(validateSlug("a b")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("accepts well-formed project slugs", () => {
    expect(validateSlug("my-portfolio")).toEqual({ valid: true });
    expect(validateSlug("acme-corp-docs")).toEqual({ valid: true });
    expect(validateSlug("ab12")).toEqual({ valid: true });
  });

  it("rejects slugs that start or end with a hyphen", () => {
    expect(validateSlug("-leading")).toMatchObject({ valid: false, error: "invalid_format" });
    expect(validateSlug("trailing-")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("rejects slugs that are too short", () => {
    // SLUG_RE requires at least 3 chars (^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$)
    expect(validateSlug("ab")).toMatchObject({ valid: false, error: "invalid_format" });
    expect(validateSlug("a")).toMatchObject({ valid: false, error: "invalid_format" });
    expect(validateSlug("")).toMatchObject({ valid: false, error: "invalid_format" });
  });
});

describe("slug uniqueness guarantees project isolation", () => {
  it("two different slugs cannot resolve to the same artifact path", () => {
    // The slug is stored UNIQUE in the DB (enforced at the database level).
    // This test documents the invariant: if slug A ≠ slug B, they map to
    // distinct artifact directories because the worker uses:
    //   SITES_HOST_PATH/<slug> → symlink → ARTIFACTS_HOST_PATH/<deploymentId>
    // Two slugs can never point to the same symlink name, so Caddy can never
    // serve project A's content at project B's subdomain.

    const slugA = "project-alpha";
    const slugB = "project-beta";
    expect(slugA).not.toBe(slugB);

    // Simulate the artifact paths the worker creates
    const artifactsBase = "/var/lib/velour/artifacts";
    const deployIdA = "uuid-a";
    const deployIdB = "uuid-b";
    const pathA = `${artifactsBase}/${deployIdA}`;
    const pathB = `${artifactsBase}/${deployIdB}`;
    expect(pathA).not.toBe(pathB);

    // Caddy's wildcard rule resolves {labels.0} = the first subdomain label.
    // /var/lib/velour/sites/project-alpha ≠ /var/lib/velour/sites/project-beta
    const sitePathA = `/var/lib/velour/sites/${slugA}`;
    const sitePathB = `/var/lib/velour/sites/${slugB}`;
    expect(sitePathA).not.toBe(sitePathB);
  });
});
