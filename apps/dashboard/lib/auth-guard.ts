import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { projects, deployments, type DeploymentState } from "@velour/db";

// Valid state transitions — any transition not listed here is rejected.
const ALLOWED_TRANSITIONS: Record<DeploymentState, DeploymentState[]> = {
  queued:      ["building", "failed"],
  // Worker promotes building → live directly (atomic: rolls back previous live and promotes new).
  // building → deploying is reserved for future multi-step deployments (e.g., CDN upload).
  building:    ["failed", "deploying", "live"],
  failed:      [],
  deploying:   ["live", "failed"],
  live:        ["stopped", "rolled_back"],
  stopped:     [],
  rolled_back: [],
};

export function canTransition(from: DeploymentState, to: DeploymentState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// Returns the project only if it belongs to the given userId.
export async function getProjectForUser(projectId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

// Returns the deployment only if its project belongs to the given userId.
export async function getDeploymentForUser(deploymentId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ deployment: deployments, project: projects })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(
      and(eq(deployments.id, deploymentId), eq(projects.userId, userId)),
    )
    .limit(1);
  return rows[0]?.deployment ?? null;
}

// Advance a deployment state only if the transition is valid and the caller owns it.
export async function transitionDeployment(
  deploymentId: string,
  userId: string,
  to: DeploymentState,
): Promise<{ ok: boolean; error?: string }> {
  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) return { ok: false, error: "not_found" };
  if (!canTransition(deployment.state, to)) {
    return { ok: false, error: `invalid_transition:${deployment.state}->${to}` };
  }

  const db = getDb();
  await db
    .update(deployments)
    .set({
      state: to,
      updatedAt: new Date(),
      finishedAt: ["failed", "live", "stopped", "rolled_back"].includes(to)
        ? new Date()
        : undefined,
    })
    .where(eq(deployments.id, deploymentId));

  return { ok: true };
}
