const RESERVED = new Set([
  "api", "app", "www", "mail", "admin", "static",
  "assets", "dashboard", "velour", "health",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (RESERVED.has(slug)) return { valid: false, error: "reserved" };
  if (!SLUG_RE.test(slug)) return { valid: false, error: "invalid_format" };
  return { valid: true };
}
