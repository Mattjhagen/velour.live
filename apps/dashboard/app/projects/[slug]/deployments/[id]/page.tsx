import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects, deployments, buildLogs } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";
import { Badge } from "@/components/Badge";
import { LogStream } from "@/components/LogStream";

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

const TERMINAL = new Set(["live", "failed", "stopped", "rolled_back"]);

export default async function DeploymentDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.userId, session.user.id)))
    .limit(1);
  if (!project) redirect("/projects");

  const [deployment] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, id), eq(deployments.projectId, project.id)))
    .limit(1);
  if (!deployment) redirect(`/projects/${slug}`);

  const existingLogs = await db
    .select()
    .from(buildLogs)
    .where(eq(buildLogs.deploymentId, id))
    .orderBy(asc(buildLogs.createdAt));

  const isTerminal = TERMINAL.has(deployment.state);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-zinc-900">Deployment</h2>
          <p className="font-mono text-xs text-zinc-400">{id}</p>
        </div>
        <Badge state={deployment.state} />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Commit</dt>
            <dd className="font-mono text-zinc-900">{deployment.commitSha.slice(0, 7)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Started</dt>
            <dd className="text-zinc-900">{deployment.createdAt.toLocaleString()}</dd>
          </div>
          {deployment.finishedAt && (
            <div>
              <dt className="text-zinc-500">Finished</dt>
              <dd className="text-zinc-900">{deployment.finishedAt.toLocaleString()}</dd>
            </div>
          )}
          {deployment.artifactPath && (
            <div>
              <dt className="text-zinc-500">Artifact</dt>
              <dd className="truncate font-mono text-xs text-zinc-400">{deployment.artifactPath}</dd>
            </div>
          )}
        </dl>
      </div>

      {isTerminal ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-950 font-mono text-xs text-zinc-300">
          <div className="border-b border-zinc-800 px-4 py-2 text-zinc-500">Build log</div>
          <div className="max-h-[480px] overflow-y-auto p-4 leading-5">
            {existingLogs.length === 0 ? (
              <span className="text-zinc-600">No log output.</span>
            ) : (
              existingLogs.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.line.startsWith("ERROR") || l.line.startsWith("FAILED")
                      ? "text-red-400"
                      : l.line.startsWith("===")
                        ? "font-semibold text-violet-400"
                        : ""
                  }
                >
                  {l.line}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <LogStream deploymentId={id} />
      )}
    </div>
  );
}
