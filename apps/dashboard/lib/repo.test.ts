import { describe, it, expect } from "vitest";
import { validateRepoUrl } from "./repo";

describe("validateRepoUrl", () => {
  it("accepts a public https GitHub URL", () => {
    expect(validateRepoUrl("https://github.com/user/repo")).toMatchObject({ valid: true });
  });

  it("accepts any public https URL", () => {
    expect(validateRepoUrl("https://gitlab.com/user/repo.git")).toMatchObject({ valid: true });
  });

  it("rejects http (non-TLS)", () => {
    expect(validateRepoUrl("http://github.com/user/repo")).toMatchObject({ valid: false });
  });

  it("rejects git@ SSH URLs", () => {
    expect(validateRepoUrl("git@github.com:user/repo.git")).toMatchObject({ valid: false });
  });

  it("rejects file:// URLs", () => {
    expect(validateRepoUrl("file:///etc/passwd")).toMatchObject({ valid: false });
  });

  it("rejects localhost", () => {
    expect(validateRepoUrl("https://localhost/repo")).toMatchObject({ valid: false });
  });

  it("rejects 127.0.0.1 loopback", () => {
    expect(validateRepoUrl("https://127.0.0.1/repo")).toMatchObject({ valid: false });
  });

  it("rejects 169.254.169.254 (cloud metadata endpoint)", () => {
    expect(validateRepoUrl("https://169.254.169.254/latest/meta-data/")).toMatchObject({ valid: false });
  });

  it("rejects 10.x.x.x (RFC 1918)", () => {
    expect(validateRepoUrl("https://10.0.0.1/repo")).toMatchObject({ valid: false });
  });

  it("rejects 172.16-31.x.x (RFC 1918)", () => {
    expect(validateRepoUrl("https://172.16.0.1/repo")).toMatchObject({ valid: false });
    expect(validateRepoUrl("https://172.31.0.1/repo")).toMatchObject({ valid: false });
    // 172.32.x is public
    expect(validateRepoUrl("https://172.32.0.1/repo")).toMatchObject({ valid: true });
  });

  it("rejects 192.168.x.x (RFC 1918)", () => {
    expect(validateRepoUrl("https://192.168.1.1/repo")).toMatchObject({ valid: false });
  });

  it("rejects empty string", () => {
    expect(validateRepoUrl("")).toMatchObject({ valid: false });
  });

  it("rejects a bare hostname with no scheme", () => {
    expect(validateRepoUrl("github.com/user/repo")).toMatchObject({ valid: false });
  });
});
