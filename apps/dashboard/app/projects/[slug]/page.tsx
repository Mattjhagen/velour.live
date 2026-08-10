import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects, deployments } from "@velour/db";
import { eq, and, desc } from "drizzle-orm";
import { Badge } from "@/components/Badge";
import { triggerDeployment, rollbackDeployment } from "@/lib/actions";

interface Props {
  params: Promise<{ slug: string }>;
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function DeploymentsPage({ params }: Props) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) redirect("/projects");

  const deploys = await db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, project.id))
    .orderBy(desc(deployments.createdAt));

  const trigger = triggerDeployment.bind(null, slug);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-medium text-zinc-900">Deployments</h2>
          <p className="text-sm text-zinc-500">{deploys.length} total</p>
        </div>
        <form action={trigger}>
          <button
            type="submit"
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            Deploy
          </button>
        </form>
      </div>

      {deploys.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center">
          <p className="text-sm text-zinc-500">No deployments yet. Hit Deploy to create one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Commit</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">When</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {deploys.map((d) => {
                const rollback = rollbackDeployment.bind(null, slug, d.id);
                return (
                  <tr key={d.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                      {d.commitSha.slice(0, 7)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge state={d.state} />
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {timeAgo(d.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(d.state === "stopped" || d.state === "rolled_back") && (
                        <form action={rollback} className="inline">
                          <button
                            type="submit"
                            className="rounded border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                          >
                            Rollback
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
