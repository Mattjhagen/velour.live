import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects, deployments, buildLogs } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";
import { Badge } from "@/components/Badge";
import { LogStream } from "@/components/LogStream";
import { StaticLogView } from "@/components/StaticLogView";

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
  const isLive = deployment.state === "live";
  const siteUrl = `https://${project.slug}.velour.live`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-zinc-900">Deployment</h2>
          <p className="font-mono text-xs text-zinc-400">{id}</p>
        </div>
        <Badge state={deployment.state} />
      </div>

      {isLive && (
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-5 py-4 transition-colors hover:bg-violet-100"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-500">Live at</p>
            <p className="mt-0.5 font-mono text-base font-semibold text-violet-700">{siteUrl}</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-violet-500">
            <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 1h6m0 0v6m0-6L7 9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      )}

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
        <StaticLogView lines={existingLogs.map((l) => l.line)} />
      ) : (
        <LogStream deploymentId={id} />
      )}
    </div>
  );
}
