import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db";
import { pingRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const [postgres, redis] = await Promise.all([pingDb(), pingRedis()]);
  const status = postgres && redis ? "ok" : "degraded";
  return NextResponse.json({ status, postgres, redis }, {
    status: status === "ok" ? 200 : 503,
  });
}
