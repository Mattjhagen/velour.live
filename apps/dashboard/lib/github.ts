import crypto from "crypto";

// Verify a GitHub webhook signature (X-Hub-Signature-256: sha256=<hex>)
export function verifyWebhookSignature(
  payload: string,
  secret: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Generate a cryptographically random webhook secret
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
