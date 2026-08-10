import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects } from "@velour/db";
import { eq, desc } from "drizzle-orm";
import { validateSlug } from "@/lib/slug";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getDb()
    .select()
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .orderBy(desc(projects.updatedAt));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { name, slug } = body as { name?: string; slug?: string };
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const v = validateSlug(slug ?? "");
  if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const [project] = await getDb()
      .insert(projects)
      .values({ userId: session.user.id, name: name.trim(), slug: slug! })
      .returning();
    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }
}
