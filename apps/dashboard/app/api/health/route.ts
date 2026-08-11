import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db";
import { pingRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const [postgres, redis] = await Promise.all([pingDb(), pingRedis()]);
  const ok = postgres && redis;
  // Return only overall status — per-service breakdown is internal operational info
  return NextResponse.json({ status: ok ? "ok" : "degraded" }, {
    status: ok ? 200 : 503,
  });
}
