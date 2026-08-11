import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { projects, deployments } from "@velour/db";
import { eq, and, desc } from "drizzle-orm";

async function getProject(slug: string, userId: string) {
  const [project] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.userId, userId)))
    .limit(1);
  return project ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const project = await getProject(slug, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await getDb()
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, project.id))
    .orderBy(desc(deployments.createdAt));

  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 10 manual deploys per minute per user
  const rl = await checkRateLimit(`deploy:${session.user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate limit exceeded" }, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const { slug } = await params;
  const project = await getProject(slug, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const commitSha = (body as { commitSha?: string }).commitSha ?? "manual";

  const [deployment] = await getDb()
    .insert(deployments)
    .values({ projectId: project.id, commitSha, state: "queued" })
    .returning();

  // Enqueue the build job so the worker picks it up
  const queueType = project.projectType === "container" ? "container-build" : "build";
  await getRedis().rpush(
    "velour:deploy:queue",
    JSON.stringify({ type: queueType, deploymentId: deployment.id }),
  );

  return NextResponse.json(deployment, { status: 201 });
}
