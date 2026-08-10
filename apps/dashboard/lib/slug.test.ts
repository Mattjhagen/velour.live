import { describe, it, expect } from "vitest";
import { validateSlug } from "./slug";

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    expect(validateSlug("my-project")).toEqual({ valid: true });
    expect(validateSlug("hello-world-123")).toEqual({ valid: true });
    expect(validateSlug("abc")).toEqual({ valid: true });
  });

  it("rejects reserved words", () => {
    for (const word of ["api", "app", "www", "admin", "dashboard"]) {
      expect(validateSlug(word)).toMatchObject({ valid: false, error: "reserved" });
    }
  });

  it("rejects slugs with uppercase letters", () => {
    expect(validateSlug("MyProject")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("rejects slugs with invalid characters", () => {
    expect(validateSlug("my_project")).toMatchObject({ valid: false, error: "invalid_format" });
    expect(validateSlug("my project")).toMatchObject({ valid: false, error: "invalid_format" });
    expect(validateSlug("my.project")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("rejects slugs starting or ending with a hyphen", () => {
    expect(validateSlug("-bad")).toMatchObject({ valid: false, error: "invalid_format" });
    expect(validateSlug("bad-")).toMatchObject({ valid: false, error: "invalid_format" });
  });
});
