import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects, environmentVariables } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";
import { addEnvVar, deleteEnvVar } from "@/lib/actions";
import { EnvVarForm } from "@/components/EnvVarForm";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EnvPage({ params }: Props) {
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

  const vars = await db
    .select({ id: environmentVariables.id, key: environmentVariables.key, createdAt: environmentVariables.createdAt })
    .from(environmentVariables)
    .where(eq(environmentVariables.projectId, project.id))
    .orderBy(asc(environmentVariables.key));

  const addAction = addEnvVar.bind(null, slug);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Add form */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-zinc-900">Add variable</h2>
        <EnvVarForm action={addAction} />
        <p className="mt-3 text-xs text-zinc-400">
          Values are encrypted with AES-256-GCM and never shown after saving.
          Adding or removing variables takes effect on the next deployment.
        </p>
      </div>

      {/* Existing vars */}
      <div>
        <h2 className="mb-3 font-medium text-zinc-900">
          Variables <span className="ml-1 text-sm font-normal text-zinc-400">({vars.length})</span>
        </h2>
        {vars.length === 0 ? (
          <p className="text-sm text-zinc-400">No variables yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {vars.map((v, i) => {
              const del = deleteEnvVar.bind(null, slug, v.id);
              return (
                <div
                  key={v.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < vars.length - 1 ? "border-b border-zinc-100" : ""
                  }`}
                >
                  <div>
                    <span className="font-mono text-sm font-medium text-zinc-900">{v.key}</span>
                    <span className="ml-3 font-mono text-sm text-zinc-400">••••••••</span>
                  </div>
                  <form action={del}>
                    <button
                      type="submit"
                      className="rounded px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
