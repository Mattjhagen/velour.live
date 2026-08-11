import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature, generateWebhookSecret } from "./github";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-abc123";
  const payload = JSON.stringify({ ref: "refs/heads/main", after: "abc123" });

  function sign(body: string, s: string) {
    return `sha256=${crypto.createHmac("sha256", s).update(body, "utf8").digest("hex")}`;
  }

  it("returns true for a valid signature", () => {
    expect(verifyWebhookSignature(payload, secret, sign(payload, secret))).toBe(true);
  });

  it("returns false for a wrong secret", () => {
    expect(verifyWebhookSignature(payload, secret, sign(payload, "wrong-secret"))).toBe(false);
  });

  it("returns false for a tampered payload", () => {
    const tampered = payload + "extra";
    expect(verifyWebhookSignature(tampered, secret, sign(payload, secret))).toBe(false);
  });

  it("returns false when signature is null", () => {
    expect(verifyWebhookSignature(payload, secret, null)).toBe(false);
  });

  it("returns false for a malformed signature string", () => {
    expect(verifyWebhookSignature(payload, secret, "not-a-signature")).toBe(false);
  });
});

describe("generateWebhookSecret", () => {
  it("returns a 64-char hex string", () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value each call", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});
