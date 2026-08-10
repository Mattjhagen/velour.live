import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, environmentVariables } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";

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

  // Return keys only — values are never exposed via API
  const vars = await getDb()
    .select({ id: environmentVariables.id, key: environmentVariables.key, createdAt: environmentVariables.createdAt })
    .from(environmentVariables)
    .where(eq(environmentVariables.projectId, project.id))
    .orderBy(asc(environmentVariables.key));

  return NextResponse.json(vars);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const project = await getProject(slug, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { key, value } = body as { key?: string; value?: string };
  if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 });
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return NextResponse.json({ error: "key must be UPPER_SNAKE_CASE" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });

  try {
    const [ev] = await getDb()
      .insert(environmentVariables)
      .values({ projectId: project.id, key, valueEncrypted: encrypt(value) })
      .returning({ id: environmentVariables.id, key: environmentVariables.key, createdAt: environmentVariables.createdAt });
    return NextResponse.json(ev, { status: 201 });
  } catch {
    return NextResponse.json({ error: `Key "${key}" already exists` }, { status: 409 });
  }
}
