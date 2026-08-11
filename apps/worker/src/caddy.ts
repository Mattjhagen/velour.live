import * as fs from "fs/promises";
import * as path from "path";
import { getDb } from "./db";
import { projects, deployments } from "@velour/db";
import { eq, and } from "drizzle-orm";

const CADDY_ADMIN = process.env.CADDY_ADMIN_URL ?? "http://caddy:2019";
const SITES_HOST_PATH = process.env.SITES_PATH ?? "/var/lib/velour/sites";
const DOMAIN = process.env.VELOUR_DOMAIN ?? "velour.live";

export interface ContainerRoute {
  slug: string;
  port: number;
}

// Update a static site symlink: slug → artifactPath
export async function relinkSlug(slug: string, artifactPath: string): Promise<void> {
  await fs.mkdir(SITES_HOST_PATH, { recursive: true });
  const linkPath = path.join(SITES_HOST_PATH, slug);
  try { await fs.unlink(linkPath); } catch {}
  await fs.symlink(artifactPath, linkPath);
}

// Remove a slug symlink (when a project is deleted or stopped)
export async function unlinkSlug(slug: string): Promise<void> {
  const linkPath = path.join(SITES_HOST_PATH, slug);
  try { await fs.unlink(linkPath); } catch {}
}

// Query DB for all live container app routes, regenerate Caddy config, reload.
export async function syncCaddyRoutes(extraRoute?: ContainerRoute): Promise<void> {
  const db = getDb();

  // Find all projects of type 'container' with a live deployment.
  const rows = await db
    .select({ slug: projects.slug, containerPort: projects.containerPort })
    .from(projects)
    .innerJoin(
      deployments,
      and(eq(deployments.projectId, projects.id), eq(deployments.state, "live")),
    )
    .where(eq(projects.projectType, "container"));

  const routes: ContainerRoute[] = rows.map((r) => ({
    slug: r.slug,
    port: r.containerPort,
  }));

  // Merge in an extra route if provided (e.g., just went live before DB reflects it)
  if (extraRoute && !routes.find((r) => r.slug === extraRoute.slug)) {
    routes.push(extraRoute);
  }

  await reloadCaddy(routes);
}

async function reloadCaddy(containerRoutes: ContainerRoute[]): Promise<void> {
  const caddyfile = generateCaddyfile(containerRoutes);

  const res = await fetch(`${CADDY_ADMIN}/load`, {
    method: "POST",
    headers: { "Content-Type": "text/caddyfile" },
    body: caddyfile,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Caddy reload failed (${res.status}): ${body}`);
  }
}

function generateCaddyfile(containerRoutes: ContainerRoute[]): string {
  const lines: string[] = [
    "{",
    "  auto_https off",
    "  admin 0.0.0.0:2019",
    "}",
    "",
    `# Main domain → dashboard`,
    `${DOMAIN}, www.${DOMAIN} {`,
    "  reverse_proxy dashboard:3000",
    "}",
    "",
  ];

  // Explicit container routes must come before the wildcard
  for (const { slug, port } of containerRoutes) {
    lines.push(`# Container app: ${slug}`);
    lines.push(`${slug}.${DOMAIN} {`);
    lines.push(`  reverse_proxy velour-app-${slug}:${port}`);
    lines.push("}");
    lines.push("");
  }

  // Wildcard for static sites
  lines.push(`# Slug subdomains → static artifacts`);
  lines.push(`*.${DOMAIN} {`);
  lines.push(`  root * ${SITES_HOST_PATH}/{labels.0}`);
  lines.push("  file_server {");
  lines.push("    hide .git");
  lines.push("  }");
  lines.push("  handle_errors 404 {");
  lines.push("    rewrite * /index.html");
  lines.push("    file_server");
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}
