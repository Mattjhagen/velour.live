import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { projects, deployments } from "@velour/db";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/github";

// POST /api/github/webhook?project=<slug>
// GitHub sends push events here. We verify the signature, deduplicate by
// commit SHA, and enqueue exactly one deployment per unique commit.
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("project");
  if (!slug) return NextResponse.json({ error: "missing project param" }, { status: 400 });

  // Read raw body for signature verification (must happen before any parsing)
  const rawBody = await req.text();

  const event = req.headers.get("x-github-event");
  const delivery = req.headers.get("x-github-delivery");
  const signature = req.headers.get("x-hub-signature-256");

  // We only care about push events
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

  let payload: { ref?: string; after?: string; head_commit?: { id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Only deploy pushes to the default branch (refs/heads/main or refs/heads/master)
  const ref = payload.ref ?? "";
  if (!ref.startsWith("refs/heads/")) {
    return NextResponse.json({ ok: true, skipped: "non-branch push" });
  }

  const commitSha = payload.after ?? payload.head_commit?.id ?? "unknown";
  if (!commitSha || commitSha === "0000000000000000000000000000000000000000") {
    return NextResponse.json({ ok: true, skipped: "branch deletion" });
  }

  // Deduplicate: reject if a deployment for this project+commitSha already exists
  const existing = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.projectId, project.id), eq(deployments.commitSha, commitSha)))
    .limit(1);

  if (existing.length) {
    return NextResponse.json({ ok: true, skipped: "duplicate delivery", deploymentId: existing[0].id });
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
