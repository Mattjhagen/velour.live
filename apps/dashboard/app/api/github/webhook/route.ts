import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { projects, deployments } from "@velour/db";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/github";

// POST /api/github/webhook?project=<slug>
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("project");
  if (!slug) return NextResponse.json({ error: "missing project param" }, { status: 400 });

  // Rate limit: 20 webhook deliveries per minute per project slug
  const rl = await checkRateLimit(`webhook:${slug}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // Read raw body before any parsing — required for HMAC verification
  const rawBody = await req.text();

  const event = req.headers.get("x-github-event");
  const delivery = req.headers.get("x-github-delivery");
  const signature = req.headers.get("x-hub-signature-256");

  if (event !== "push") {
    return NextResponse.json({ ok: true, skipped: "non-push event" });
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);

  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  if (!project.githubWebhookSecret) {
    return NextResponse.json({ error: "webhook not configured for this project" }, { status: 403 });
  }

  if (!verifyWebhookSignature(rawBody, project.githubWebhookSecret, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Delivery ID deduplication — reject replays within 24 hours
  if (delivery) {
    const deliveryKey = `velour:delivery:${delivery}`;
    const claimed = await getRedis().set(deliveryKey, "1", "EX", 86400, "NX");
    if (!claimed) {
      return NextResponse.json({ ok: true, skipped: "duplicate delivery ID" });
    }
  }

  let payload: { ref?: string; after?: string; head_commit?: { id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const ref = payload.ref ?? "";
  if (!ref.startsWith("refs/heads/")) {
    return NextResponse.json({ ok: true, skipped: "non-branch push" });
  }

  const commitSha = payload.after ?? payload.head_commit?.id ?? "unknown";
  if (!commitSha || commitSha === "0000000000000000000000000000000000000000") {
    return NextResponse.json({ ok: true, skipped: "branch deletion" });
  }

  // DB-level deduplication: same project + same commit SHA
  const existing = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.projectId, project.id), eq(deployments.commitSha, commitSha)))
    .limit(1);

  if (existing.length) {
    return NextResponse.json({ ok: true, skipped: "commit already deployed", deploymentId: existing[0].id });
  }

  const queueType = project.projectType === "container" ? "container-build" : "build";

  const [deployment] = await db
    .insert(deployments)
    .values({ projectId: project.id, commitSha, state: "queued" })
    .returning({ id: deployments.id });

  await getRedis().rpush(
    "velour:deploy:queue",
    JSON.stringify({ type: queueType, deploymentId: deployment.id }),
  );

  return NextResponse.json({ ok: true, deploymentId: deployment.id, commitSha, delivery });
}
