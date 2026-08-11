import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@velour/db", () => ({
  projects: { id: "id", userId: "user_id" },
  deployments: { id: "id", projectId: "project_id", state: "state" },
}));

import { canTransition, getProjectForUser, getDeploymentForUser } from "./auth-guard";
import { getDb } from "@/lib/db";
import type { DeploymentState } from "@velour/db";

// ── State machine ──────────────────────────────────────────────────────────

describe("canTransition", () => {
  const valid: [DeploymentState, DeploymentState][] = [
    ["queued",    "building"],
    ["queued",    "failed"],
    ["building",  "failed"],
    ["building",  "deploying"],
    ["building",  "live"],    // worker promotes directly: builds and symlinks atomically
    ["deploying", "live"],
    ["deploying", "failed"],
    ["live",      "stopped"],
    ["live",      "rolled_back"],
  ];

  const invalid: [DeploymentState, DeploymentState][] = [
    ["live",        "queued"],
    ["live",        "building"],
    ["failed",      "live"],
    ["stopped",     "live"],
    ["rolled_back", "live"],
  ];

  it.each(valid)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(invalid)("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

// ── Authorization boundary ─────────────────────────────────────────────────

const USER_A = "user-a-uuid";
const USER_B = "user-b-uuid";
const PROJECT_A = "project-a-uuid";

function makeDbMock(ownerUserId: string) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            // Only return a row when the userId matches the owner.
            return Promise.resolve(
              ownerUserId === USER_A ? [{ id: PROJECT_A, userId: USER_A }] : [],
            );
          }),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getProjectForUser", () => {
  it("returns project when userId matches owner", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbMock(USER_A) as never);
    const result = await getProjectForUser(PROJECT_A, USER_A);
    expect(result).not.toBeNull();
  });

  it("returns null when userId does not match owner", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbMock(USER_B) as never);
    const result = await getProjectForUser(PROJECT_A, USER_B);
    expect(result).toBeNull();
  });
});

describe("getDeploymentForUser", () => {
  it("returns null when deployment does not belong to user", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbMock(USER_B) as never);
    const result = await getDeploymentForUser("deploy-uuid", USER_B);
    expect(result).toBeNull();
  });
});
