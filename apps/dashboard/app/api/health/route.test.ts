import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock infra dependencies so the test doesn't need a real Postgres/Redis.
vi.mock("@/lib/db", () => ({ pingDb: vi.fn() }));
vi.mock("@/lib/redis", () => ({ pingRedis: vi.fn() }));

import { GET } from "./route";
import { pingDb } from "@/lib/db";
import { pingRedis } from "@/lib/redis";

beforeEach(() => vi.resetAllMocks());

describe("GET /api/health", () => {
  it("returns 200 and status ok when both services are reachable", async () => {
    vi.mocked(pingDb).mockResolvedValue(true);
    vi.mocked(pingRedis).mockResolvedValue(true);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", postgres: true, redis: true });
  });

  it("returns 503 and status degraded when postgres is down", async () => {
    vi.mocked(pingDb).mockResolvedValue(false);
    vi.mocked(pingRedis).mockResolvedValue(true);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.postgres).toBe(false);
  });

  it("returns 503 and status degraded when redis is down", async () => {
    vi.mocked(pingDb).mockResolvedValue(true);
    vi.mocked(pingRedis).mockResolvedValue(false);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.redis).toBe(false);
  });
});
