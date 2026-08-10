import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects, deployments } from "@velour/db";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import type { DeploymentState } from "@velour/db";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const db = getDb();
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .orderBy(desc(projects.updatedAt));

  const latestDeployByProject = new Map<string, { state: DeploymentState; createdAt: Date }>();

  if (userProjects.length > 0) {
    const ids = userProjects.map((p) => p.id);
    const deploys = await db
      .select({ projectId: deployments.projectId, state: deployments.state, createdAt: deployments.createdAt })
      .from(deployments)
      .where(inArray(deployments.projectId, ids))
      .orderBy(desc(deployments.createdAt));

    for (const d of deploys) {
      if (!latestDeployByProject.has(d.projectId)) {
        latestDeployByProject.set(d.projectId, { state: d.state, createdAt: d.createdAt });
      }
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          New project
        </Link>
      </div>

      {userProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-20 text-center">
          <p className="text-sm font-medium text-zinc-600">No projects yet</p>
          <p className="mt-1 text-sm text-zinc-400">Create your first project to get started</p>
          <Link
            href="/projects/new"
            className="mt-4 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            New project
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {userProjects.map((project) => {
            const latest = latestDeployByProject.get(project.id);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.slug}`}
                className="group rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 group-hover:text-violet-600">
                      {project.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-400">{project.slug}</p>
                  </div>
                  {latest && <Badge state={latest.state} />}
                </div>
                <p className="mt-3 text-xs text-zinc-400">
                  {latest ? `Deployed ${timeAgo(latest.createdAt)}` : "No deployments yet"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
