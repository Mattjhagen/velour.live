/**
 * Validates a git repository URL before it is stored or used in a git clone.
 * Enforces https:// only and blocks private/link-local IP ranges that could
 * be used for SSRF against cloud metadata endpoints (169.254.169.254, etc.)
 * or internal services.
 */
export function validateRepoUrl(raw: string): { valid: boolean; error?: string } {
  if (!raw) return { valid: false, error: "Repository URL is required" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, error: "Repository URL must use https://" };
  }

  const host = url.hostname.toLowerCase();

  if (!host) return { valid: false, error: "URL has no hostname" };

  // Block unambiguous loopback / unspecified hostnames
  if (host === "localhost" || host === "0.0.0.0" || host === "::1") {
    return { valid: false, error: "Private or local hostnames are not allowed" };
  }

  // Block raw IPv4 addresses in private / link-local ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    const blocked =
      a === 0 ||                                    // 0.0.0.0/8
      a === 10 ||                                   // 10.0.0.0/8 (RFC 1918)
      a === 127 ||                                  // 127.0.0.0/8 (loopback)
      (a === 169 && b === 254) ||                   // 169.254.0.0/16 (link-local / cloud metadata)
      (a === 172 && b >= 16 && b <= 31) ||          // 172.16.0.0/12 (RFC 1918)
      (a === 192 && b === 168);                     // 192.168.0.0/16 (RFC 1918)
    if (blocked) {
      return { valid: false, error: "Private or link-local IP addresses are not allowed" };
    }
  }

  return { valid: true };
}
