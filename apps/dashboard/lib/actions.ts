"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, domains, deployments, environmentVariables } from "@velour/db";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { validateSlug } from "@/lib/slug";
import { encrypt } from "@/lib/crypto";

async function requireUser(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");
  return session.user.id;
}

async function requireProject(slug: string, userId: string) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.userId, userId)))
    .limit(1);
  if (!project) redirect("/projects");
  return project;
}

// ── Projects ──────────────────────────────────────────────────────────────

export async function createProject(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUser();
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slug = (formData.get("slug") as string | null)?.trim() ?? "";

  if (!name) return { error: "Project name is required" };
  const v = validateSlug(slug);
  if (!v.valid) return { error: v.error };

  try {
    await getDb().insert(projects).values({ userId, name, slug });
  } catch {
    return { error: "That slug is already taken" };
  }
  redirect(`/projects/${slug}`);
}

export async function renameProject(
  slug: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) return { error: "Name is required" };

  await getDb()
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/projects/${slug}/settings`);
  return {};
}

export async function deleteProject(slug: string): Promise<never> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  await getDb().delete(projects).where(eq(projects.id, project.id));
  redirect("/projects");
}

// ── Environment Variables ─────────────────────────────────────────────────

export async function addEnvVar(
  slug: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  const key = (formData.get("key") as string | null)?.trim() ?? "";
  const value = (formData.get("value") as string | null) ?? "";

  if (!key) return { error: "Key is required" };
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return { error: "Key must be UPPER_SNAKE_CASE" };
  if (!value) return { error: "Value is required" };

  try {
    await getDb().insert(environmentVariables).values({
      projectId: project.id,
      key,
      valueEncrypted: encrypt(value),
    });
  } catch {
    return { error: `"${key}" already exists — delete it first to update` };
  }

  revalidatePath(`/projects/${slug}/env`);
  return {};
}

export async function deleteEnvVar(slug: string, envVarId: string): Promise<void> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  await getDb()
    .delete(environmentVariables)
    .where(
      and(eq(environmentVariables.id, envVarId), eq(environmentVariables.projectId, project.id)),
    );
  revalidatePath(`/projects/${slug}/env`);
}

// ── Domains ───────────────────────────────────────────────────────────────

export async function addDomain(
  slug: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  const domain = (formData.get("domain") as string | null)?.trim().toLowerCase() ?? "";

  if (!domain) return { error: "Domain is required" };
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(domain))
    return { error: "Invalid domain format" };

  try {
    await getDb().insert(domains).values({ projectId: project.id, domain });
  } catch {
    return { error: "Domain is already registered" };
  }

  revalidatePath(`/projects/${slug}/domains`);
  return {};
}

export async function removeDomain(slug: string, domainId: string): Promise<void> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  await getDb()
    .delete(domains)
    .where(and(eq(domains.id, domainId), eq(domains.projectId, project.id)));
  revalidatePath(`/projects/${slug}/domains`);
}

// ── Deployments ───────────────────────────────────────────────────────────

export async function triggerDeployment(slug: string): Promise<void> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  await getDb().insert(deployments).values({
    projectId: project.id,
    commitSha: "manual",
    state: "queued",
  });
  revalidatePath(`/projects/${slug}`);
}

export async function rollbackDeployment(slug: string, deploymentId: string): Promise<void> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);
  const db = getDb();

  const [target] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, project.id)))
    .limit(1);
  if (!target) return;

  await db
    .update(deployments)
    .set({ state: "rolled_back", updatedAt: new Date() })
    .where(and(eq(deployments.projectId, project.id), eq(deployments.state, "live")));

  await db
    .update(deployments)
    .set({ state: "live", updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));

  revalidatePath(`/projects/${slug}`);
}
