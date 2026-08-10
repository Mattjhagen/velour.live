import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects } from "@velour/db";
import { eq } from "drizzle-orm";

// Caddy calls this before issuing a TLS cert for a subdomain.
// Return 200 if the slug exists as a project, 404 otherwise.
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain") ?? "";

  // Only approve *.velour.live subdomains
  const SUFFIX = ".velour.live";
  if (!domain.endsWith(SUFFIX)) {
    return new NextResponse(null, { status: 404 });
  }

  const slug = domain.slice(0, -SUFFIX.length);

  // Reject if the slug itself contains dots (nested subdomains) or is empty
  if (!slug || slug.includes(".") || !/^[a-z0-9-]+$/.test(slug)) {
    return new NextResponse(null, { status: 404 });
  }

  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);

  return new NextResponse(null, { status: project ? 200 : 404 });
}
