"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { projects, domains, deployments, environmentVariables } from "@velour/db";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { validateSlug } from "@/lib/slug";
import { validateRepoUrl } from "@/lib/repo";
import { encrypt, encryptWithKey, decryptWithKey, validateKeyHex } from "@/lib/crypto";
import { generateWebhookSecret } from "@/lib/github";

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

  // Enqueue cleanup before deleting — worker removes symlink and stops container
  await getRedis().rpush(
    "velour:deploy:queue",
    JSON.stringify({ type: "project-delete", slug, projectType: project.projectType }),
  );

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

export async function updateBuildSettings(
  slug: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);

  const repoUrl = (formData.get("repoUrl") as string | null)?.trim() ?? "";
  const buildCommand =
    (formData.get("buildCommand") as string | null)?.trim() || "npm install && npm run build";
  const outputDir = (formData.get("outputDir") as string | null)?.trim() || "dist";

  if (repoUrl) {
    const v = validateRepoUrl(repoUrl);
    if (!v.valid) return { error: v.error };
  }

  await getDb()
    .update(projects)
    .set({ repoUrl: repoUrl || null, buildCommand, outputDir, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  revalidatePath(`/projects/${slug}/settings`);
  return {};
}

export async function triggerDeployment(slug: string): Promise<void> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);

  const db = getDb();
  const [created] = await db
    .insert(deployments)
    .values({ projectId: project.id, commitSha: "manual", state: "queued" })
    .returning({ id: deployments.id });

  const queueType = project.projectType === "container" ? "container-build" : "build";
  await getRedis().rpush(
    "velour:deploy:queue",
    JSON.stringify({ type: queueType, deploymentId: created.id }),
  );
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
  // Static sites need an artifact path to restore the symlink
  if (project.projectType === "static" && !target.artifactPath) return;

  await db.transaction(async (tx) => {
    await tx
      .update(deployments)
      .set({ state: "rolled_back", updatedAt: new Date() })
      .where(and(eq(deployments.projectId, project.id), eq(deployments.state, "live")));

    await tx
      .update(deployments)
      .set({ state: "live", updatedAt: new Date(), finishedAt: new Date() })
      .where(eq(deployments.id, deploymentId));
  });

  // For static sites, enqueue a symlink update so Caddy serves the correct artifacts.
  // For container apps, the worker will restart the correct container on next deploy.
  if (project.projectType === "static" && target.artifactPath) {
    await getRedis().rpush(
      "velour:deploy:queue",
      JSON.stringify({ type: "relink", slug: project.slug, artifactPath: target.artifactPath }),
    );
  }

  revalidatePath(`/projects/${slug}`);
}

// ── GitHub Webhook ─────────────────────────────────────────────────────────

export async function rotateWebhookSecret(slug: string): Promise<{ secret: string } | { error: string }> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);

  const secret = generateWebhookSecret();
  await getDb()
    .update(projects)
    .set({ githubWebhookSecret: secret, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  revalidatePath(`/projects/${slug}/settings`);
  return { secret };
}

export async function revokeWebhookSecret(slug: string): Promise<void> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);

  await getDb()
    .update(projects)
    .set({ githubWebhookSecret: null, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  revalidatePath(`/projects/${slug}/settings`);
}

// ── Container settings ─────────────────────────────────────────────────────

export async function updateContainerSettings(
  slug: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUser();
  const project = await requireProject(slug, userId);

  const projectType = (formData.get("projectType") as string | null) ?? "static";
  if (projectType !== "static" && projectType !== "container") {
    return { error: "Invalid project type" };
  }

  const portRaw = parseInt((formData.get("containerPort") as string | null) ?? "3000", 10);
  if (isNaN(portRaw) || portRaw < 1 || portRaw > 65535) {
    return { error: "Port must be between 1 and 65535" };
  }

  await getDb()
    .update(projects)
    .set({ projectType, containerPort: portRaw, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  revalidatePath(`/projects/${slug}/settings`);
  return {};
}

// ── Admin: Encryption key rotation ────────────────────────────────────────────

export async function rotateEncryptionKey(
  _prev: { error?: string; rotated?: number } | null,
  formData: FormData,
): Promise<{ error?: string; rotated?: number }> {
  await requireUser(); // admin-only (dashboard is already gated to VELOUR_ADMIN_EMAIL)

  const newKeyHex = ((formData.get("newKey") as string | null) ?? "").trim();
  const v = validateKeyHex(newKeyHex);
  if (!v.valid) return { error: v.error };

  const newKey = Buffer.from(newKeyHex, "hex");
  const oldKey = Buffer.from(process.env.VELOUR_ENCRYPTION_KEY!, "hex");

  const db = getDb();
  const rows = await db
    .select({ id: environmentVariables.id, valueEncrypted: environmentVariables.valueEncrypted })
    .from(environmentVariables);

  if (rows.length === 0) return { rotated: 0 };

  // Decrypt with old key, re-encrypt with new key
  const updates: { id: string; valueEncrypted: string }[] = [];
  for (const row of rows) {
    try {
      const plaintext = decryptWithKey(row.valueEncrypted, oldKey);
      updates.push({ id: row.id, valueEncrypted: encryptWithKey(plaintext, newKey) });
    } catch {
      return { error: `Failed to decrypt env var ${row.id} — the current key may already be rotated` };
    }
  }

  // Write all new ciphertexts atomically
  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(environmentVariables)
        .set({ valueEncrypted: u.valueEncrypted, updatedAt: new Date() })
        .where(eq(environmentVariables.id, u.id));
    }
  });

  return { rotated: updates.length };
}
